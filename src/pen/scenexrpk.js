import * as Croquet from "@croquet/croquet";
import {
  AmbientLight,
  AudioLoader,
  AxesHelper,
  Mesh,
  PositionalAudio,
  PlaneBufferGeometry,
  MeshBasicMaterial,
  Scene,
  FaceColors,
  PlaneGeometry,
  CircleGeometry,
  Raycaster,
  Vector2,
  DoubleSide,
  Color,
  SphereBufferGeometry,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { MeshLine, MeshLineMaterial } from "threejs-meshline";
import { Camera } from "../engine/engine";
import Renderer from "../engine/renderer";
import XRInput from "../engine/xrinput";
const penPath = require("./assets/plutopen.glb");
const penSFXPath = require("./assets/audio/pen.ogg");
const MAX_POINTS = 10000;

const scene = new Scene();
scene.add(new AxesHelper(5));
scene.add(new AmbientLight(0xffffff, 4));

class PenModel extends Croquet.Model {
  init() {
    this.subscribe("pen", "startdrawingmodel", this.StartDrawing);
    this.subscribe("pen", "stopdrawingmodel", this.StopDrawing);
    this.subscribe("pen", "drawupdatemodel", this.DrawUpdate);
    this.subscribe("pen", "undo", this.Undo);
  }
  StartDrawing(viewId) {
    this.publish("pen", "startdrawingview", viewId);
  }

  StopDrawing(viewId) {
    this.publish("pen", "stopdrawingview", viewId);
  }

  DrawUpdate(data) {
    this.publish("pen", "drawupdateview", data);
  }

  Undo(viewID) {
    this.publish("pen", "undoview", viewID);
  }
}
PenModel.register();

class PenView extends Croquet.View {
  constructor(model) {
    super(model);

    this.subscribe("pen", "startdrawingview", this.StartDrawingView);
    this.subscribe("pen", "stopdrawingview", this.StopDrawingView);
    this.subscribe("pen", "drawupdateview", this.DrawUpdateView);
    this.subscribe("pen", "undoview", this.UndoView);

    this.scene = scene;
    this.isDrawing = false;
    this.undoBreak = false;
    this.strokeHistory = {};
    this.curColor = new Color(0xff0000);
    this.penSFXDict = {};

    //cam race condition hack
    // setTimeout(e => {
    const al = new AudioLoader().load(penSFXPath, buffer => {
      this.penSFXBuffer = buffer;
    });
    // }, 1);

    // default to right hand.
    // avoid XRInputs data structures due to XRPK oninputsourcechange bug
    this.activeController = Renderer.xr.getControllerGrip(1);
    this.secondaryController = Renderer.xr.getControllerGrip(2);
    this.activeInputSource = Renderer.xr.getController(1);

    Renderer.xr
      .getController(0)
      .addEventListener("selectstart", this.StartDrawing.bind(this));
    Renderer.xr
      .getController(1)
      .addEventListener("selectstart", this.StartDrawing.bind(this));
    Renderer.xr
      .getController(0)
      .addEventListener("selectend", this.StopDrawing.bind(this));
    Renderer.xr
      .getController(1)
      .addEventListener("selectend", this.StopDrawing.bind(this));

    this.CreatePen();
    this.CreateColorPalette();
  }
  StartDrawing(e) {
    this.activeController = e.target;
    this.secondaryController =
      this.activeController == Renderer.xr.getControllerGrip(1)
        ? Renderer.xr.getControllerGrip(2)
        : Renderer.xr.getControllerGrip(1);
    this.publish("pen", "startdrawingmodel", this.viewId);
    this.StartDrawingTemp();
    this.isDrawing = true;
  }

  StartDrawingView(viewId) {
    //setup line mesh
    this.positions = new Float32Array(MAX_POINTS * 3);

    // increases every frame, iterating over this.positions for each stroke
    this.currentPos = 0;

    this.line = new MeshLine();
    this.lineMaterial = new MeshLineMaterial({
      color: this.curColor,
      lineWidth: 0.015,
    });
    this.line.frustumCulled = false;
    this.line.setBufferArray(this.positions);
    this.curStroke = new Mesh(this.line, this.lineMaterial);
    this.curStroke.userID = viewId;
    scene.add(this.curStroke);
    if (this.strokeHistory[viewId] == undefined) {
      this.strokeHistory[viewId] = [];
    }

    this.strokeHistory[viewId].push(this.curStroke);
  }

  StartDrawingTemp() {
    //setup line mesh
    this.tempPositions = new Float32Array(MAX_POINTS * 3);

    // increases every frame, iterating over this.positions for each stroke
    this.tempCurrentPos = 0;

    this.tempLine = new MeshLine();
    this.tempLineMaterial = new MeshLineMaterial({
      color: 0xff0000,
      lineWidth: 0.015,
    });
    this.tempLine.frustumCulled = false;
    this.tempLine.setBufferArray(this.tempPositions);
    this.tempCurStroke = new Mesh(this.tempLine, this.tempLineMaterial);
    scene.add(this.tempCurStroke);
  }

  StopDrawing(e) {
    this.publish("pen", "stopdrawingmodel", this.viewId);
    this.isDrawing = false;
    // remove temporary local line
    scene.remove(this.tempCurStroke);
  }

  StopDrawingView(viewId) {
    this.StopFX(viewId);
  }

  DrawUpdateModel(position) {
    const data = { position: position, viewId: this.viewId };
    this.publish("pen", "drawupdatemodel", data);

    // also draw temporary line locally for smoother feedback
    for (let i = this.tempCurrentPos; i < MAX_POINTS * 3; i++) {
      this.tempPositions[i * 3] = position[0];
      this.tempPositions[i * 3 + 1] = position[1];
      this.tempPositions[i * 3 + 2] = position[2];
    }
    this.tempCurrentPos++;
    this.tempLine.setBufferArray(this.tempPositions);
  }

  DrawUpdateView(data) {
    // due to setDrawRange perf issues, set *all* remaining points to latest cont position instead
    for (let i = this.currentPos; i < MAX_POINTS * 3; i++) {
      this.positions[i * 3] = data.position[0];
      this.positions[i * 3 + 1] = data.position[1];
      this.positions[i * 3 + 2] = data.position[2];
    }
    this.currentPos++;

    this.line.setBufferArray(this.positions);
    this.PlayFX(data);
  }

  UndoModel() {
    this.publish("pen", "undo", this.viewId);
  }

  UndoView(viewId) {
    if (this.undoBreak) return;
    scene.remove(
      this.strokeHistory[viewId][this.strokeHistory[viewId].length - 1]
    );
    this.strokeHistory[viewId].pop();
    this.undoBreak = true;
    setTimeout(() => {
      this.undoBreak = false;
    }, 500);
  }

  PlayFX(data) {
    const idS = data.viewId;
    if (this.penSFXDict[idS] == undefined) {
      this.penSFXDict[idS] = new PositionalAudio(Camera.audioListener);
      this.penSFXDict[idS].gain.gain.value = 0.3;
      this.penSFXDict[idS].setLoop(true);

      this.penSFXDict[idS].setRefDistance(10);

      this.penSFXDict[idS].setBuffer(this.penSFXBuffer);
      scene.add(this.penSFXDict[idS]);
    }
    this.penSFXDict[idS].position.x = data.position[0];
    this.penSFXDict[idS].position.y = data.position[1];
    this.penSFXDict[idS].position.z = data.position[2];
    if (!this.penSFXDict[idS].isPlaying) this.penSFXDict[idS].play();
  }

  StopFX(viewId) {
    if (
      this.penSFXDict[viewId] == undefined ||
      !this.penSFXDict[viewId].isPlaying
    )
      return;
    this.penSFXDict[viewId].stop();
  }

  CreateColorPalette() {
    // const pgeo = new PlaneGeometry(0.2, 0.2, 64, 64);
    const pgeo = new CircleGeometry(0.075, 256);
    pgeo.faces.forEach((face, i) => {
      face.color.setHSL(i / pgeo.faces.length, 1, 0.5);
    });
    const pmat = new MeshBasicMaterial({
      vertexColors: FaceColors,
      transparent: true,
      opacity: 0.75,
      side: DoubleSide,
      // wireframe: true,
    });
    this.palette = new Mesh(pgeo, pmat);
    scene.add(this.palette);

    this.palette.cc = new Mesh(
      new SphereBufferGeometry(0.0075, 16),
      new MeshBasicMaterial({ color: this.curColor, wireframe: true })
    );
    this.palette.cc.Update = () => {
      this.palette.cc.rotation.x += 0.001;
      this.palette.cc.rotation.z -= 0.001;
    };
    // this.palette.cc.position.z += 0.024;
    this.palette.cc.rotateOnAxis(new Vector3(0, 0, 1), Math.PI / 2);
    this.palette.add(this.palette.cc);

    var raycaster = new Raycaster();
    var mouse = new Vector2();
    var that = this;

    function onMouseMove(event) {
      // calculate mouse position in normalized device coordinates
      // (-1 to +1) for both components

      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, Camera);
      var intersects = raycaster.intersectObjects(scene.children);
      for (var i = 0; i < intersects.length; i++) {
        // intersects[i].object.material.color.set(0xff0000);
        if (intersects[i].face == undefined) return;
        that.curColor = intersects[i].face.color;
        that.palette.cc.material.color = that.curColor;
      }
    }

    window.addEventListener("mousemove", onMouseMove, false);
  }

  CreatePen() {
    //pen model
    var gltfLoader = new GLTFLoader();
    const that = this;

    gltfLoader.load(penPath, function (gltf) {
      that.pen = gltf.scene;

      that.pen.Update = () => {
        if (that.activeController && that.pen) {
          that.pen.position.copy(that.activeController.position);
          that.pen.rotation.copy(that.activeController.rotation);
        }
        if (that.secondaryController && that.palette) {
          that.palette.position.copy(that.secondaryController.position);
          that.palette.rotation.copy(that.secondaryController.rotation);
        }
        if (that.isDrawing) {
          that.DrawUpdateModel(that.activeController.position.toArray());
        } else {
          // any joystick movement to undo
          if (!XRInput.inputSources || XRInput.inputSources.length == 0) return;
          XRInput.inputSources.forEach(input => {
            input.gamepad.axes.forEach(axis => {
              if (that.undoBreak) return;
              if (axis != 0) {
                that.UndoModel();
              }
            });
          });
        }
      };
      scene.add(that.pen);
    });
  }
}

Croquet.Session.join("awegfaweg8", PenModel, PenView);

export { scene };

import * as Croquet from "@croquet/croquet";
import {
  AmbientLight,
  AudioLoader,
  AxesHelper,
  Mesh,
  PositionalAudio,
  MeshBasicMaterial,
  Scene,
  FaceColors,
  CircleGeometry,
  Raycaster,
  Vector2,
  LineBasicMaterial,
  DoubleSide,
  Color,
  SphereBufferGeometry,
  Vector3,
  Object3D,
  Matrix4,
  BufferGeometry,
  Line,
  ArrowHelper,
  OctahedronBufferGeometry,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { MeshLine, MeshLineMaterial } from "threejs-meshline";
import { Camera } from "../engine/engine";
import Renderer from "../engine/renderer";
import State from "../engine/state";
import XRInput from "../engine/xrinput";
const penPath = require("./assets/plutopen.glb");
const penSFXPath = require("./assets/audio/pen.ogg");
const MAX_POINTS = 10000;

const scene = new Scene();
// scene.add(new AxesHelper(5));
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

    const al = new AudioLoader().load(penSFXPath, buffer => {
      this.penSFXBuffer = buffer;
    });

    State.eventHandler.addEventListener("xrsessionstarted", e => {
      console.log(e);
      e.addEventListener("selectstart", this.StartDrawing.bind(this));
      e.addEventListener("selectend", this.StopDrawing.bind(this));
    });

    // default to right hand.
    // avoid XRInputs data structures due to XRPK oninputsourcechange bug
    this.primaryControllerGrip = Renderer.xr.getControllerGrip(1);
    this.secondaryControllerGrip = Renderer.xr.getControllerGrip(0);
    this.primaryController = Renderer.xr.getController(1);
    this.secondaryController = Renderer.xr.getController(0);

    this.CreatePen();
    this.CreateColorPalette();
  }
  StartDrawing(e) {
    console.log(e.inputSource.handedness);
    switch (e.inputSource.handedness) {
      case "left":
        this.primaryControllerGrip = Renderer.xr.getControllerGrip(1);
        this.primaryController = Renderer.xr.getController(1);
        this.secondaryControllerGrip = Renderer.xr.getControllerGrip(0);
        this.secondaryController = Renderer.xr.getController(0);
        break;
      case "right":
        this.primaryControllerGrip = Renderer.xr.getControllerGrip(0);
        this.primaryController = Renderer.xr.getController(0);
        this.secondaryControllerGrip = Renderer.xr.getControllerGrip(1);
        this.secondaryController = Renderer.xr.getController(1);
      default:
        break;
    }
    if (!this.isPicking) {
      this.publish("pen", "startdrawingmodel", this.viewId);
      this.StartDrawingTemp();
      this.isDrawing = true;
    } else {
      this.curColor = this.palette.cc.material.color;
    }
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
      color: this.curColor,
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
      opacity: 0.65,
      side: DoubleSide,
      // wireframe: true,
    });
    this.palette = new Mesh(pgeo, pmat);

    this.palette.cc = new Mesh(
      new OctahedronBufferGeometry(0.015),
      new MeshBasicMaterial({ color: this.curColor, wireframe: true })
    );
    this.palette.cc.position.z += 0.015;
    this.palette.cc.Update = () => {
      this.palette.cc.rotation.y += 0.005;
      this.palette.cc.rotation.z += 0.005;
      if (this.secondaryControllerGrip && this.palette) {
        this.paletteCont.position.copy(this.secondaryControllerGrip.position);
        this.paletteCont.rotation.copy(this.secondaryControllerGrip.rotation);
      }
    };
    this.palette.cc.updateColor = color => {
      this.palette.cc.material.color = color;
    };
    this.palette.cc.rotateOnAxis(new Vector3(1, 0, 0), Math.PI / 2);
    // this.palette.cc.position.z += 0.025;

    this.palette.add(this.palette.cc);
    this.paletteCont = new Object3D();
    this.palette.rotateOnAxis(new Vector3(1, 0, 0), Math.PI / -2);
    this.paletteCont.add(this.palette);
    this.palette.position.y += 0.125;

    scene.add(this.paletteCont);

    this.raycaster = new Raycaster();

    // var mouse = new Vector2();
    var that = this;

    var geometry = new BufferGeometry().setFromPoints([
      new Vector3(0, 0, 0),
      new Vector3(0, 1, 0),
    ]);

    var line = new Line(geometry, new LineBasicMaterial({ color: 0xff00ff }));
    line.name = "line";
    line.scale.z = 5;
    this.line1 = line.clone();
    this.scene.add(this.line1);
    // this.line2 = line.clone();
    // this.primaryControllerGrip.add(this.line1);
    // this.secondaryControllerGrip.add(this.line2);
    this.scene.add(this.primaryControllerGrip);
    this.scene.add(this.secondaryControllerGrip);
  }

  getIntersections(controller) {
    var tempMatrix = new Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin = controller.position;

    this.raycaster.ray.direction.set(0, -1, 0).applyMatrix4(tempMatrix);
    this.raycaster.ray.far = 0.05;

    var intersects = this.raycaster.intersectObject(this.paletteCont, true);
    if (intersects[0] != undefined && intersects[0].face != undefined) {
      this.isPicking = true;
      this.palette.cc.updateColor(intersects[0].face.color);
    } else {
      this.isPicking = false;
    }
    // console.log(intersects[0].face);
  }

  CreatePen() {
    //pen model
    var gltfLoader = new GLTFLoader();
    const that = this;

    gltfLoader.load(penPath, function (gltf) {
      that.pen = gltf.scene;

      that.pen.Update = () => {
        if (that.primaryControllerGrip && that.pen) {
          that.pen.position.copy(that.primaryControllerGrip.position);
          that.pen.rotation.copy(that.primaryControllerGrip.rotation);
          that.getIntersections(that.primaryController);
        }
        if (that.isDrawing) {
          that.DrawUpdateModel(that.primaryControllerGrip.position.toArray());
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

Croquet.Session.join("awegfaweg10", PenModel, PenView);

export { scene };

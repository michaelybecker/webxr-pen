import * as Croquet from "@croquet/croquet";
import {
  AmbientLight,
  AudioLoader,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  FaceColors,
  Line,
  LineBasicMaterial,
  TextureLoader,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronBufferGeometry,
  PositionalAudio,
  Raycaster,
  Scene,
  Vector3,
  // AxesHelper,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { MeshLine, MeshLineMaterial } from "threejs-meshline";
import { Camera } from "../engine/engine";
import Renderer from "../engine/renderer";
import State from "../engine/state";
const penPath = require("./assets/models/plutopen.glb");
const penSFXPath = require("./assets/audio/pen.ogg");
const clickSFXPath = require("./assets/audio/click.ogg");
// const brushTexturePath = require("./assets/images/brush.png");

const Q = Croquet.Constants;
Q.MAX_POINTS = 10000;

const scene = new Scene();
scene.add(new AmbientLight(0xffffff, 4));
// scene.add(new AxesHelper(3));

class PenModel extends Croquet.Model {
  static types() {
    return {
      Color: Color,
    };
  }
  init() {
    this.subscribe("pen", "startdrawingmodel", this.StartDrawing);
    this.subscribe("pen", "stopdrawingmodel", this.StopDrawing);
    this.subscribe("pen", "drawupdatemodel", this.DrawUpdate);
    this.subscribe("pen", "undo", this.Undo);
  }
  StartDrawing(data) {
    this.publish("pen", "startdrawingview", data);
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

    // croquet events
    this.subscribe("pen", "startdrawingview", this.StartDrawingView);
    this.subscribe("pen", "stopdrawingview", this.StopDrawingView);
    this.subscribe("pen", "drawupdateview", this.DrawUpdateView);
    this.subscribe("pen", "undoview", this.UndoView);

    this.isDrawing = false;
    this.undoBreak = false;
    this.strokeHistory = {};
    this.curColor = new Color(0xff0000);
    this.penSFXDict = {};
    this.currentStrokes = {};

    // audio init
    const al = new AudioLoader();
    al.load(penSFXPath, buffer => {
      this.penSFXBuffer = buffer;
    });
    al.load(clickSFXPath, buffer => {
      this.clickSFXBuffer = buffer;
      this.clickSFXAudio = new PositionalAudio(Camera.audioListener);
      this.clickSFXAudio.setBuffer(this.clickSFXBuffer);
      this.paletteCont.add(this.clickSFXAudio);
    });

    State.eventHandler.addEventListener("xrsessionstarted", e => {
      this.inputSources = e.inputSources;
      e.addEventListener("selectstart", this.TriggerStart.bind(this));
      e.addEventListener("selectend", this.TriggerEnd.bind(this));
    });

    // input init
    // default to right hand.
    // avoid XRInputs data structures due to XRPK oninputsourcechange bug
    this.primaryControllerGrip = Renderer.xr.getControllerGrip(1);
    this.primaryController = Renderer.xr.getController(1);
    this.secondaryControllerGrip = Renderer.xr.getControllerGrip(0);
    this.secondaryController = Renderer.xr.getController(0);
    scene.add(this.primaryControllerGrip);
    scene.add(this.secondaryControllerGrip);
    this.CreatePen();
    this.CreateColorPalette();

    //debug
    // document.addEventListener("keydown", e => {
    //   const data = { viewId: this.viewId, curColor: this.curColor };
    //   this.publish("pen", "startdrawingmodel", data);
    //   // this.StartDrawingTemp();
    //   this.isDrawing = true;

    //   const that2 = this;
    //   setInterval(function () {
    //     that2.DrawUpdateModel([
    //       -1.5 + Math.random() * 3,
    //       -1.5 + Math.random() * 3,
    //       -1.5 + Math.random() * 3,
    //     ]);
    //   }, 500);
    //   this.isDrawing = false;
    // });
  }

  TriggerStart(e) {
    Renderer.xr.getSession().inputSources.forEach((inputSource, i) => {
      if (e.inputSource.handedness == inputSource.handedness) {
        this.primaryIndex = i;
        this.secondaryIndex = this.primaryIndex == 1 ? 0 : 1;
      }
    });

    this.primaryControllerGrip = Renderer.xr.getControllerGrip(
      this.primaryIndex
    );
    this.primaryController = Renderer.xr.getController(this.primaryIndex);
    this.secondaryControllerGrip = Renderer.xr.getControllerGrip(
      this.secondaryIndex
    );
    this.secondaryController = Renderer.xr.getController(this.secondaryIndex);

    if (!this.isPicking) {
      // painting
      const data = { viewId: this.viewId, curColor: this.curColor };
      this.publish("pen", "startdrawingmodel", data);
      this.StartDrawingTemp();
      this.isDrawing = true;
    } else {
      // color picking
      this.clickSFXAudio.play();
      this.curColor = this.palette.cc.material.color;
      this.penMesh.material.color = this.curColor;
    }
  }

  StartDrawingView(data) {
    if (this.currentStrokes[data.viewId] == undefined) {
      this.currentStrokes[data.viewId] = {};
    }
    //setup line mesh
    this.currentStrokes[data.viewId]["currentStrokesBuffer"] = new Float32Array(
      Q.MAX_POINTS * 3
    );

    // increases every frame, iterating over the buffer for each user for each stroke
    this.currentStrokes[data.viewId]["currentStrokesPosition"] = 0;

    this.currentStrokes[data.viewId]["currentLine"] = new MeshLine();
    // this.tL = new TextureLoader();
    this.lineMaterial = new MeshLineMaterial({
      color: data.curColor,
      lineWidth: 0.015,
      // useAlphaMap: true,
      // alphaMap: this.tL.load(brushTexturePath),
      // depthTest: false,
      // transparent: true,
      // alphaTest: 0.1,
    });
    this.currentStrokes[data.viewId]["currentLine"].frustumCulled = false;
    this.currentStrokes[data.viewId]["currentLine"].setBufferArray(
      this.currentStrokes[data.viewId]["currentStrokesBuffer"]
    );
    this.currentStrokes[data.viewId]["currentMesh"] = new Mesh(
      this.currentStrokes[data.viewId]["currentLine"],
      this.lineMaterial
    );
    scene.add(this.currentStrokes[data.viewId]["currentMesh"]);
    if (this.strokeHistory[data.viewId] == undefined) {
      this.strokeHistory[data.viewId] = [];
    }
    this.strokeHistory[data.viewId].push(
      this.currentStrokes[data.viewId]["currentMesh"]
    );
  }

  TriggerEnd(e) {
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
    for (let i = this.tempCurrentPos; i < Q.MAX_POINTS * 3; i++) {
      this.tempPositions[i * 3] = position[0];
      this.tempPositions[i * 3 + 1] = position[1];
      this.tempPositions[i * 3 + 2] = position[2];
    }
    this.tempCurrentPos++;
    this.tempLine.setBufferArray(this.tempPositions);
  }

  DrawUpdateView(data) {
    // due to setDrawRange perf issues, set *all* remaining points to latest cont position instead
    for (
      let i = this.currentStrokes[data.viewId]["currentStrokesPosition"];
      i < Q.MAX_POINTS * 3;
      i++
    ) {
      this.currentStrokes[data.viewId]["currentStrokesBuffer"][i * 3] =
        data.position[0];
      this.currentStrokes[data.viewId]["currentStrokesBuffer"][i * 3 + 1] =
        data.position[1];
      this.currentStrokes[data.viewId]["currentStrokesBuffer"][i * 3 + 2] =
        data.position[2];
    }
    this.currentStrokes[data.viewId]["currentStrokesPosition"]++;

    this.currentStrokes[data.viewId]["currentLine"].setBufferArray(
      this.currentStrokes[data.viewId]["currentStrokesBuffer"]
    );
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
  StartDrawingTemp() {
    //setup line mesh
    this.tempPositions = new Float32Array(Q.MAX_POINTS * 3);

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
  CreatePen() {
    //pen model
    var gltfLoader = new GLTFLoader();
    const that = this;

    gltfLoader.load(penPath, function (gltf) {
      that.penMesh = gltf.scene.children[1];
      that.penMesh.rotateOnAxis(new Vector3(1, 0, 0), Math.PI * 2);
      that.pen = new Object3D();
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

          if (!that.inputSources || that.inputSources.length == 0) return;
          that.inputSources.forEach(input => {
            input.gamepad.axes.forEach(axis => {
              if (that.undoBreak) return;
              if (axis != 0) {
                that.UndoModel();
              }
            });
          });
        }
      };
      that.pen.add(that.penMesh);
      scene.add(that.pen);
    });

    this.raycaster = new Raycaster();
    this.raycastLine = new Line(
      new BufferGeometry().setFromPoints([
        new Vector3(0, 0, 0),
        new Vector3(0, -0.1, 0),
      ]),
      new LineBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 1 })
    );
    this.raycastLine.Update = () => {
      this.raycastLine.quaternion.copy(this.paletteCont.quaternion);
      if (this.primaryControllerGrip) {
        this.raycastLine.position.copy(this.primaryControllerGrip.position);
        this.raycastLine.material.opacity = this.isPicking ? 1 : 0;
      }
    };
    scene.add(this.raycastLine);
  }
  CreateColorPalette() {
    const pgeo = new CircleGeometry(0.075, 256);
    pgeo.faces.forEach((face, i) => {
      face.color.setHSL(i / pgeo.faces.length, 1, 0.5);
    });
    const pmat = new MeshBasicMaterial({
      vertexColors: FaceColors,
      transparent: true,
      opacity: 0.65,
      side: DoubleSide,
    });
    this.palette = new Mesh(pgeo, pmat);
    this.palette.rotateOnAxis(new Vector3(1, 0, 0), Math.PI / -2);
    this.palette.position.y += 0.125;

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
      this.raycastLine.material.color = color;
    };
    this.palette.cc.rotateOnAxis(new Vector3(1, 0, 0), Math.PI / 2);

    this.palette.add(this.palette.cc);
    this.paletteCont = new Object3D();
    this.paletteCont.add(this.palette);
    scene.add(this.paletteCont);
  }
  getIntersections(controller) {
    var tempMatrix = new Matrix4();
    tempMatrix.identity().extractRotation(this.paletteCont.matrixWorld);
    this.raycaster.ray.origin = controller.position;
    this.raycaster.ray.direction.set(0, -1, 0).applyMatrix4(tempMatrix);
    this.raycaster.far = 0.1;

    const intersects = this.raycaster.intersectObject(this.paletteCont, true);
    if (intersects[0] != undefined && intersects[0].face != undefined) {
      this.isPicking = true;
      this.palette.cc.updateColor(intersects[0].face.color);
    } else {
      this.isPicking = false;
    }
  }
}

Croquet.Session.join("awegfaweg11sertb", PenModel, PenView);

export { scene };

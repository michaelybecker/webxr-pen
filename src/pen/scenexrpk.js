import * as Croquet from "@croquet/croquet";
import {
  AmbientLight,
  AudioLoader,
  AxesHelper,
  Mesh,
  PositionalAudio,
  SphereBufferGeometry,
  MeshNormalMaterial,
  Scene,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { MeshLine, MeshLineMaterial } from "threejs-meshline";
import { Camera } from "../engine/engine";
import Renderer from "../engine/renderer";
import XRInput from "../engine/xrinput";
const penPath = require("./assets/plutopen.glb");
const penSFXPath = require("./assets/audio/pen.ogg");
const penSFXDict = {};
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

    //cam race condition hack
    // setTimeout(e => {
    const al = new AudioLoader().load(penSFXPath, buffer => {
      this.penSFXBuffer = buffer;
    });
    // }, 1);

    // default to right hand.
    // avoid XRInputs data structures due to XRPK oninputsourcechange bug
    this.activeController = Renderer.xr.getControllerGrip(1);
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

    //pen model
    var gltfLoader = new GLTFLoader();
    const that = this;
    let pen;
    gltfLoader.load(penPath, function (gltf) {
      pen = gltf.scene;

      pen.Update = () => {
        if (that.activeController) {
          pen.position.copy(that.activeController.position);
          pen.rotation.copy(that.activeController.rotation);
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
      scene.add(pen);
    });
  }
  StartDrawing(e) {
    this.activeController = e.target;
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
      color: 0xff0000,
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
    if (penSFXDict[idS] == undefined) {
      penSFXDict[idS] = new PositionalAudio(Camera.audioListener);
      penSFXDict[idS].gain.gain.value = 0.3;
      penSFXDict[idS].setLoop(true);
      console.log(penSFXDict[idS].gain.gain.value);
      penSFXDict[idS].setRefDistance(10);

      penSFXDict[idS].setBuffer(this.penSFXBuffer);
      scene.add(penSFXDict[idS]);
    }
    penSFXDict[idS].position.x = data.position[0];
    penSFXDict[idS].position.y = data.position[1];
    penSFXDict[idS].position.z = data.position[2];
    if (!penSFXDict[idS].isPlaying) penSFXDict[idS].play();
  }

  StopFX(viewId) {
    if (penSFXDict[viewId] == undefined || !penSFXDict[viewId].isPlaying)
      return;
    penSFXDict[viewId].stop();
  }
}

Croquet.Session.join("awegfaweg8", PenModel, PenView);

export { scene };

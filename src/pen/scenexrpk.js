import * as Croquet from "@croquet/croquet";
import { Scene, AxesHelper, AmbientLight, Mesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { MeshLine, MeshLineMaterial } from "threejs-meshline";
import Renderer from "../engine/renderer";
import XRInput from "../engine/xrinput";
const penPath = require("./assets/plutopen.glb");
const MAX_POINTS = 10000;

let pen;
const scene = new Scene();
scene.add(new AxesHelper(5));
scene.add(new AmbientLight(0xffffff, 4));

class PenModel extends Croquet.Model {
  init() {
    this.subscribe("pen", "startdrawmodel", this.StartDrawing);
    this.subscribe("pen", "drawupdatemodel", this.DrawUpdate);
    this.subscribe("pen", "undo", this.Undo);
  }

  StartDrawing(viewId) {
    this.publish("pen", "startdrawlocal", viewId);
  }

  DrawUpdate(position, viewId) {
    this.publish("pen", "drawupdatelocal", position, viewId);
  }

  Undo(viewID) {
    this.publish("pen", "undolocal", viewID);
  }
}
PenModel.register();

class PenView extends Croquet.View {
  constructor(model) {
    super(model);

    this.subscribe("pen", "startdrawlocal", this.StartDrawLocal);
    this.subscribe("pen", "drawupdatelocal", this.DrawUpdateLocal);
    this.subscribe("pen", "undolocal", this.UndoLocal);

    this.scene = scene;
    this.isDrawing = false;
    this.undoBreak = false;
    this.strokeHistory = {};

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
    gltfLoader.load(penPath, function (gltf) {
      pen = gltf.scene;

      pen.Update = () => {
        if (that.activeController) {
          pen.position.copy(that.activeController.position);
          pen.rotation.copy(that.activeController.rotation);
        }
        if (that.isDrawing) {
          that.DrawUpdate(that.activeController.position.toArray());
        } else {
          // any joystick movement to undo
          if (!XRInput.inputSources || XRInput.inputSources.length == 0) return;
          XRInput.inputSources.forEach(input => {
            input.gamepad.axes.forEach(axis => {
              if (that.undoBreak) return;
              if (axis != 0) {
                that.Undo();
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
    this.publish("pen", "startdrawmodel", this.viewId);
    this.StartDrawTemp();
    this.isDrawing = true;
  }

  StartDrawLocal(viewId) {
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

  StartDrawTemp() {
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
    this.isDrawing = false;

    // remove temporary local line
    scene.remove(this.tempCurStroke);
  }

  DrawUpdate(position) {
    this.publish("pen", "drawupdatemodel", position, this.viewId);

    // also draw temporary line locally for smoother feedback
    for (let i = this.tempCurrentPos; i < MAX_POINTS * 3; i++) {
      this.tempPositions[i * 3] = position[0];
      this.tempPositions[i * 3 + 1] = position[1];
      this.tempPositions[i * 3 + 2] = position[2];
    }
    this.tempCurrentPos++;
    this.tempLine.setBufferArray(this.tempPositions);
  }

  DrawUpdateLocal(position, viewId) {
    if (this.curStroke.viewId != viewId) return;
    // due to setDrawRange perf issues, set *all* remaining points to latest cont position instead
    for (let i = this.currentPos; i < MAX_POINTS * 3; i++) {
      this.positions[i * 3] = position[0];
      this.positions[i * 3 + 1] = position[1];
      this.positions[i * 3 + 2] = position[2];
    }
    this.currentPos++;

    this.line.setBufferArray(this.positions);
  }

  Undo() {
    this.publish("pen", "undo", this.viewId);
  }

  UndoLocal(viewId) {
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
}

Croquet.Session.join("awegfaweg6", PenModel, PenView);

export { scene };

import * as Croquet from "@croquet/croquet";
// import { Mesh, Object3D } from "three";
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
    // this.scene = scene;
    this.strokeHistory = [];
  }
}
PenModel.register();

// class PenModel extends Croquet.Model {
//   init() {
//     this.count = 0;
//     this.subscribe("counter", "reset", this.resetCounter);
//     this.future(1000).tick();
//   }

//   resetCounter() {
//     this.count = 0;
//     this.publish("counter", "update", this.count);
//   }

//   tick() {
//     this.count++;
//     this.publish("counter", "update", this.count);
//     this.future(1000).tick();
//   }
// }

// PenModel.register();

// var d = document.createElement("div");
// d.id = "countDisplay";
// d.style.zIndex = 1000;
// document.body.appendChild(d);

class PenView extends Croquet.View {
  constructor(model) {
    super(model);
    this.scene = scene;

    this.isDrawing = false;
    this.undoBreak = false;

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
          that.DrawLine(that.activeController.position);
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
    this.isDrawing = true;
    // this.activeController = e.target;
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
    this.scene.add(this.curStroke);

    //TODO: FIX
    // this.strokeHistory.push(this.curStroke);
  }
  StopDrawing(e) {
    this.isDrawing = false;
  }

  DrawLine(position) {
    // due to setDrawRange perf issues, set *all* remaining points to latest cont position instead
    for (var i = this.currentPos; i < MAX_POINTS * 3; i++) {
      this.positions[i * 3] = position.x;
      this.positions[i * 3 + 1] = position.y;
      this.positions[i * 3 + 2] = position.z;
    }
    this.currentPos++;
    this.line.setBufferArray(this.positions);
  }

  Undo() {
    this.remove(this.strokeHistory[this.strokeHistory.length - 1]);
    this.strokeHistory.pop();
    if (this.scene.children) this.undoBreak = true;
    setTimeout(() => {
      this.undoBreak = false;
    }, 500);
  }
}

// class PenView extends Croquet.View {
//   constructor(model) {
//     super(model);

//     const countDisplay = document.querySelector("#countDisplay");
//     document.onclick = event => {
//       this.publish("counter", "reset");
//     };
//     this.subscribe("counter", "update", this.handleUpdate);
//   }

//   handleUpdate(data) {
//     countDisplay.textContent = data;
//   }
// }

Croquet.Session.join("pen-tacostal4", PenModel, PenView);

// const p = new Pen(scene);

export { scene };

import * as Croquet from "@croquet/croquet";
import {
  Scene,
  AxesHelper,
  AmbientLight,
  Mesh,
  // BufferAttribute,
  // Box3,
  // Vector3,
  // Sphere,
  // Matrix4,
  // Color,
  // Vector2,
  // Euler,
} from "three";
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
  // static types() {
  //   return {
  //     MeshLine: MeshLine,
  //     MeshLineMaterial: MeshLineMaterial,
  //     BufferAttribute: BufferAttribute,
  //     Box3: Box3,
  //     Vector3: Vector3,
  //     Vector2: Vector2,
  //     Sphere: Sphere,
  //     Matrix4: Matrix4,
  //     Color: Color,
  //     Mesh: Mesh,
  //     Scene: Scene,
  //     Euler: Euler,
  //   };
  // }
  init() {
    // undo array
    this.strokeHistory = [];

    this.subscribe("pen", "draw", this.StartDrawing);
    this.subscribe("pen", "drawupdate", this.DrawUpdate);
    this.subscribe("pen", "undo", this.Undo);
  }

  StartDrawing() {
    this.isDrawing = true;

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
    scene.add(this.curStroke);

    this.strokeHistory.push(this.curStroke);
  }

  DrawUpdate(position) {
    // due to setDrawRange perf issues, set *all* remaining points to latest cont position instead
    for (var i = this.currentPos; i < MAX_POINTS * 3; i++) {
      this.positions[i * 3] = position[0];
      this.positions[i * 3 + 1] = position[1];
      this.positions[i * 3 + 2] = position[2];
    }
    this.currentPos++;
    this.line.setBufferArray(this.positions);
  }

  Undo() {
    if (this.undoBreak) return;
    scene.remove(this.strokeHistory[this.strokeHistory.length - 1]);
    this.strokeHistory.pop();
    this.undoBreak = true;
    setTimeout(() => {
      this.undoBreak = false;
    }, 500);
  }
}
PenModel.register();

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
    this.isDrawing = true;
    this.publish("pen", "draw");
  }
  StopDrawing(e) {
    this.isDrawing = false;
  }

  DrawUpdate(position) {
    this.publish("pen", "drawupdate", position);
  }

  Undo() {
    this.publish("pen", "undo");
  }
}

Croquet.Session.join("pen-xrpk5", PenModel, PenView);

export { scene };

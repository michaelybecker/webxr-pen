import { Mesh, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { MeshLine, MeshLineMaterial } from "threejs-meshline";
import Renderer from "../engine/renderer";
import XRInput from "../engine/xrinput";
const penPath = require("./assets/plutopen.glb");
const MAX_POINTS = 10000;

export default class Pen extends Object3D {
  constructor(scene, params) {
    super(params);
    this.scene = scene;
    this.isDrawing = false;
    this.undoBreak = false;

    // default to right hand.
    // avoid XRInputs data structures due to XRPK oninputsourcechange bug
    this.activeController = Renderer.xr.getControllerGrip(1);
    this.activeInputSource = Renderer.xr.getController(1);
    this.strokeHistory = [];

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
    const penRef = this;

    gltfLoader.load(penPath, function (gltf) {
      penRef.penModel = gltf.scene;
      penRef.add(penRef.penModel);
    });
  }

  StartDrawing(e) {
    this.isDrawing = true;
    this.activeController = e.target;
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
    this.strokeHistory.push(this.curStroke);
  }
  StopDrawing(e) {
    this.isDrawing = false;
    this.networking.remoteSync.addLocalObject(
      this.curStroke,
      { type: "stroke" },
      true
    );
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
  Update() {
    if (this.activeController && this.penModel) {
      this.position.copy(this.activeController.position);
      this.rotation.copy(this.activeController.rotation);
    }
    if (this.isDrawing) {
      this.DrawLine(this.activeController.position);
    } else {
      // any joystick movement to undo
      if (!XRInput.inputSources || XRInput.inputSources.length == 0) return;
      XRInput.inputSources.forEach(input => {
        input.gamepad.axes.forEach(axis => {
          if (this.undoBreak) return;
          if (axis != 0) {
            this.Undo();
          }
        });
      });
    }
  }
}

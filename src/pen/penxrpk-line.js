import {
  Mesh,
  Line,
  LineBasicMaterial,
  BufferGeometry,
  MeshBasicMaterial,
  DoubleSide,
  Object3D,
  SphereBufferGeometry,
  BufferAttribute,
  TextureLoader,
  Vector3,
} from "three";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import Renderer from "../engine/renderer";
import XRInput from "../engine/xrinput";
const penPath = require("./assets/plutopen.glb");

import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2";
import { GeometryUtils } from "three/examples/jsm/utils/GeometryUtils.js";

const MAX_POINTS = 1000;
let curVec = new Vector3();

export default class Pen extends Object3D {
  constructor(scene, networking, params) {
    super(params);
    this.networking = networking;
    this.scene = scene;
    this.isDrawing = false;
    this.isDrawingDebug = false;
    this.undoBreak = false;
    this.activeController = Renderer.xr.getControllerGrip(1); // default to right hand
    this.activeInputSource = null;

    // avoid XRInputs due to XRPK oninputsourcechange bug
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

    // this.lineMaterial = new LineMaterial({
    //   color: 0xff0000,
    //   linewidth: 0.01,
    // });

    this.lineMaterial = new LineBasicMaterial({
      color: 0xff0000,
      linewidth: 0.01,
    });

    //shapes
    this.material = new MeshBasicMaterial({
      color: 0xff0000,
      side: DoubleSide,
      flatShading: true,
    });
    this.sphereGeometry = new SphereBufferGeometry(1, 12, 12);

    //pen model
    var gltfLoader = new GLTFLoader();
    const penRef = this;

    gltfLoader.load(penPath, function (gltf) {
      penRef.penModel = gltf.scene;
      penRef.add(penRef.penModel);
    });

    document.addEventListener("keydown", e => {
      this.StartDrawing(Renderer.xr.getControllerGrip(0));
      this.isDrawingDebug = !this.isDrawingDebug;
    });
    // networking
    // this.networking.remoteSync.addEventListener(
    //   "add",
    //   (destId, objectId, info) => {
    //     switch (info.type) {
    //       case "sphere":
    //         this.AddLocalSphere(info.posRotScale);
    //       default:
    //         return;
    //     }
    //   }
    // );

    // this.networking.remoteSync.addEventListener(
    //   "remove",
    //   (remotePeerId, objectId, object) => {
    //     if (State.debugMode) console.log("removing");
    //     scene.remove(object);
    //     if (object.parent !== null) object.parent.remove(object);
    //   }
    // );
  }

  StartDrawing(e) {
    this.isDrawing = true;
    this.activeController = e.target;
    //setup line mesh
    this.positions = new Float32Array(MAX_POINTS * 3); // 3 vertices per point
    // this.positions = [];
    this.linegeo = new BufferGeometry();
    this.linegeo.setAttribute(
      "position",
      new BufferAttribute(this.positions, 3)
    );

    // this.linegeo = new LineGeometry();
    // this.linegeo.setPositions(this.positions);

    // drawCount increases every frame, iterating over the large initial array
    this.drawCount = 0;

    // draw range
    this.linegeo.setDrawRange(0, this.drawCount);

    // this.linegeo.instanceCount = this.drawCount;
    // line
    // this.line = new Line2(this.linegeo, this.lineMaterial);

    this.line = new Line(this.linegeo, this.lineMaterial);
    this.line.computeLineDistances();
    this.line.scale.set(1, 1, 1);

    this.line.frustumCulled = false;
    this.scene.add(this.line);
  }
  StopDrawing(e) {
    this.isDrawing = false;
  }

  DrawLine(position) {
    this.positions[this.drawCount * 3] = position.x;
    this.positions[this.drawCount * 3 + 1] = position.y;
    this.positions[this.drawCount * 3 + 2] = position.z;

    this.drawCount += 1;
    // this.linegeo.instanceCount = this.drawCount;
    this.linegeo.setDrawRange(0, this.drawCount);
    this.linegeo.attributes.position.needsUpdate = true;
    this.linegeo.verticesNeedUpdate = true;
  }

  Undo() {
    this.drawCount--;
    this.linegeo.setDrawRange(0, this.drawCount);

    // this.networking.remoteSync.removeLocalObject(
    //   this.scene.children[this.scene.children.length - 1]
    // );
    // this.remove(this.children[this.children.length - 1]);
    // this.scene.Undo();
    // if (this.inkArr[this.inkArr.length - 1].name != "ink") return;

    // this.inkArr.pop(this.inkArr.length - 1);
    // const a = this.scene.children[this.scene.children.length - 1];
    // console.log(a);
    // if (a.parent != null) a.parent.remove(a);
    // while (this.scene.children.length > 0) {
    //   this.scene.remove(this.scene.children[0]);
    // }
    if (this.scene.children) this.undoBreak = true;
    setTimeout(() => {
      this.undoBreak = false;
    }, 1);
  }

  Update() {
    if (this.activeController && this.penModel) {
      this.penModel.position.copy(this.activeController.position);
      this.penModel.rotation.copy(this.activeController.rotation);
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
    if (this.isDrawingDebug) {
      curVec.x += -0.1 + Math.random() * 0.2;
      curVec.y += -0.1 + Math.random() * 0.2;
      curVec.z += -0.1 + Math.random() * 0.2;
      this.DrawLine(curVec);
    }
  }
}

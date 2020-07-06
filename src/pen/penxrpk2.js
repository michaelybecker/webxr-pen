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

export default class Pen extends Object3D {
  constructor(scene, networking, params) {
    super(params);
    this.networking = networking;
    this.scene = scene;
    this.isDrawing = false;
    this.undoBreak = false;
    this.activeController = Renderer.xr.getControllerGrip(1); // default to right hand
    this.activeInputSource = null;

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
    // this.linegeo = new BufferGeometry();
    this.linegeo = new LineGeometry();

    // this.linegeo.setAttribute(
    //   "position",
    //   new BufferAttribute(this.positions, 3)
    // );
    const points = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
    this.linegeo.setPositions(this.positions);

    this.drawCount = 0;

    this.lineMaterial = new LineMaterial({
      color: 0xff0000,
      linewidth: 0.01,
    });

    // draw range
    // this.linegeo.setDrawRange(0, this.drawCount);
    this.linegeo.instanceCount = this.drawCount;
    // line
    this.line = new Line2(this.linegeo, this.lineMaterial);
    this.line.scale.set(1, 1, 1);
    // this.line.computeLineDistances();
    // this.line.frustumCulled = false;
    this.scene.add(this.line);
  }
  StopDrawing(e) {
    // console.log("stopping");
    this.isDrawing = false;
    // this.activeController = null;

    // const geometry = new BufferGeometry().setFromPoints(curPointBuffer);

    // const line = new Line(geometry, this.lineMaterial);
    // line.geometry.verticesNeedUpdate = true;
    // this.scene.add(line);
    // console.log(line);
  }

  AddSphere(position, rotation, pressure) {
    const sphere = new Mesh(this.sphereGeometry, this.material);
    sphere.name = "ink";
    const scale = pressure * 0.05 * Math.random();
    sphere.scale.set(scale, scale, scale);
    sphere.position.copy(position);
    sphere.rotation.copy(rotation);
    const curPosRotScale = {
      position: position,
      rotation: rotation,
      scale: scale,
    };
    this.scene.add(sphere);
    // this.inkArr.push(sphere);
    // this.networking.remoteSync.addLocalObject(
    //   sphere,
    //   { type: "sphere", posRotScale: curPosRotScale },
    //   false
    // );
    return sphere;
  }

  DrawLine(position) {
    this.positions[this.drawCount * 3] = position.x;
    this.positions[this.drawCount * 3 + 1] = position.y;
    this.positions[this.drawCount * 3 + 2] = position.z;

    this.drawCount += 1;
    this.linegeo.instanceCount = this.drawCount;
    this.linegeo.setDrawRange(0, this.drawCount);
    this.linegeo.attributes.position.needsUpdate = true;
    this.linegeo.verticesNeedUpdate = true;
  }

  // AddPoint(position, orientation, pressure) {
  //   var points = [];
  //   var tgeometry = new BufferGeometry();

  //   points.push(position.x, position.y, position.z);

  //   tgeometry.setAttribute("position", new Float32BufferAttribute(points, 3));

  //   this.pmaterial = new PointsMaterial({
  //     color: 0xffffff,
  //     alphaTest: 0.5,
  //     transparent: true,
  //     map: this.particleTexture,
  //     alphaMap: this.particleTexture,
  //     size: this.currentPressure * 0.65,
  //   });
  //   var point = new Points(tgeometry, this.pmaterial);
  //   this.scene.add(point);
  // }
  Undo() {
    // console.log("undoing");

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
        // this.AddSphere(
        //   this.activeController.position,
        //   this.activeController.rotation,
        //   0.34
        // );
        this.DrawLine(this.activeController.position);
      } else {
        // this.activeInputSource.gamepad.buttons.forEach(btn => {
        //   if (btn.value != 0) this.currentPressure = btn.value / 3;
        // });

        if (!XRInput.inputSources || XRInput.inputSources.length == 0) return;
        XRInput.inputSources.forEach(input => {
          input.gamepad.axes.forEach(axis => {
            if (this.undoBreak) return;
            if (axis != 0) {
              console.log("rim");
              this.Undo();
            }
          });
        });
      }
    }
  }
}

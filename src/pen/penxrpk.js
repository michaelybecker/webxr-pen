import {
  Mesh,
  Line,
  LineBasicMaterial,
  BufferGeometry,
  MeshBasicMaterial,
  DoubleSide,
  Object3D,
  SphereBufferGeometry,
  Vector3,
  BufferAttribute,
  TextureLoader,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import Renderer from "../engine/renderer";
import XRInput from "../engine/xrinput";

const imgPath = require("./assets/disc4.png");
const penPath = require("./assets/plutopen.glb");

const MAX_POINTS = 100000;

export default class Pen extends Object3D {
  constructor(scene, networking, params) {
    super(params);
    this.networking = networking;
    this.scene = scene;
    this.isDrawing = false;
    this.undoBreak = false;
    this.activeController = null;
    this.activeInputSource = null;
    this.previousPosition = new Vector3();
    this.inkArr = [];

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

    //texture
    const textureloader = new TextureLoader();
    textureloader.load(imgPath, img => {
      this.particleTexture = img;
    });

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
    //set up a new line object
    // console.log("drawing");
    this.isDrawing = true;

    this.positions = new Float32Array(MAX_POINTS * 3); // 3 vertices per point
    this.linegeo = new BufferGeometry();

    this.linegeo.setAttribute(
      "position",
      new BufferAttribute(this.positions, 3)
    );

    this.drawCount = 0;

    this.lineMaterial = new LineBasicMaterial({
      color: 0xff0000,
      linewidth: 4, // doesn't work on ANGLE?
    });

    // draw range
    this.linegeo.setDrawRange(0, this.drawCount);

    // line
    this.line = new Line(this.linegeo, this.lineMaterial);
    this.line.frustumCulled = false;
    this.scene.add(this.line);

    // this.activeInputSource = e.inputSource;
    this.activeController = e.target;
  }
  StopDrawing(e) {
    console.log("stopping");
    this.isDrawing = false;
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
    this.linegeo.setDrawRange(0, this.drawCount);
    // this.linegeo.attributes.position.needsUpdate = true;
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
    if (this.activeController) {
      this.penModel.position.copy(this.activeController.position);
      this.penModel.rotation.copy(this.activeController.rotation);

      if (this.isDrawing) {
        // add sphere logic, optional / add to toggle
        // this.AddSphere(
        //   this.activeController.position,
        //   this.activeController.rotation,
        //   0.34
        // );
        this.DrawLine(this.activeController.position);
      } else {
        if (XRInput.inputSources.length == 0) return;
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
}

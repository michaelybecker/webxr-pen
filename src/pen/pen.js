import {
  Mesh,
  Line,
  Points,
  BufferGeometry,
  MeshBasicMaterial,
  DoubleSide,
  Object3D,
  SphereBufferGeometry,
  Vector3,
  Float32BufferAttribute,
  PointsMaterial,
  TextureLoader,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import State from "../engine/state";
import XRInput from "../engine/xrinput";

const imgPath = require("./assets/disc4.png");
const penPath = require("./assets/pen.glb");

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

    State.eventHandler.addEventListener(
      "selectstart",
      this.StartDrawing.bind(this)
    );
    State.eventHandler.addEventListener(
      "selectend",
      this.StopDrawing.bind(this)
    );

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
      console.log(penRef.penModel);
      penRef.penModel.Update = () => {
        console.log("bimmey");
      };
      // penRef.penModel.scale.set(0.025, 0.025, 0.025);
      penRef.add(penRef.penModel);
    });

    // networking
    this.networking.remoteSync.addEventListener(
      "add",
      (destId, objectId, info) => {
        switch (info.type) {
          case "sphere":
            this.AddLocalSphere(info.posRotScale);
          default:
            return;
        }
      }
    );

    this.networking.remoteSync.addEventListener(
      "remove",
      (remotePeerId, objectId, object) => {
        if (State.debugMode) console.log("removing");
        scene.remove(object);
        if (object.parent !== null) object.parent.remove(object);
      }
    );
  }

  StartDrawing(e) {
    console.log("drawing");
    this.isDrawing = true;
    this.activeInputSource = e.inputSource;
    XRInput.inputSources.forEach((ctrl, index) => {
      if (ctrl == e.inputSource) {
        this.activeControllerGrip = XRInput.controllerGrips[index];
      }
    });
  }
  StopDrawing(e) {
    console.log("stopping");
    this.isDrawing = false;
    this.activeController = null;
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
    this.networking.remoteSync.addLocalObject(
      sphere,
      { type: "sphere", posRotScale: curPosRotScale },
      false
    );
    return sphere;
  }

  AddLine(position, orientation, pressure) {
    var points = [];
    points.push(this.previousPosition);
    points.push(position);
    var geometry = new BufferGeometry().setFromPoints(points);

    var line = new Line(geometry, this.material);
    this.scene.add(line);
    this.previousPosition = position;
  }

  AddPoint(position, orientation, pressure) {
    var points = [];
    var tgeometry = new BufferGeometry();

    points.push(position.x, position.y, position.z);

    tgeometry.setAttribute("position", new Float32BufferAttribute(points, 3));

    this.pmaterial = new PointsMaterial({
      color: 0xffffff,
      alphaTest: 0.5,
      transparent: true,
      map: this.particleTexture,
      alphaMap: this.particleTexture,
      size: this.currentPressure * 0.65,
    });
    var point = new Points(tgeometry, this.pmaterial);
    this.scene.add(point);
  }
  Undo() {
    // console.log("undoing");
    console.log(this.scene.children[this.scene.children.length - 1]);

    this.networking.remoteSync.removeLocalObject(
      this.scene.children[this.scene.children.length - 1]
    );
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
    }, 1000);
  }

  Update() {
    if (this.activeControllerGrip) {
      this.penModel.position.copy(this.activeControllerGrip.position);
      this.penModel.rotation.copy(this.activeControllerGrip.rotation);
      if (this.isDrawing) {
        this.activeInputSource.gamepad.buttons.forEach(btn => {
          if (btn.value != 0) this.currentPressure = btn.value / 3;
        });
        this.AddSphere(
          this.activeControllerGrip.position,
          this.activeControllerGrip.rotation,
          this.currentPressure
        );
      } else {
        this.activeInputSource.gamepad.axes.forEach(axis => {
          if (this.undoBreak) return;
          if (axis != 0) {
            this.Undo();
          }
        });
      }
    }
  }

  AddLocalSphere(transform) {
    var sphere = new Mesh(this.sphereGeometry, this.material);
    sphere.scale.set(transform.scale, transform.scale, transform.scale);
    sphere.position.copy(transform.position);
    sphere.rotation.copy(transform.rotation);
    this.add(sphere);
  }
}

// default scene loaded in src/engine/engine.js

import {
  Scene,
  AxesHelper,
  MeshBasicMaterial,
  SphereBufferGeometry,
  Mesh,
  DoubleSide,
} from "three";

import PeerConnection from "../../engine/networking/PeerConnection";

import Pen from "./pen";

const scene = new Scene();
const networking = new PeerConnection(scene);

scene.init = () => {
  var axesHelper = new AxesHelper(5);
  scene.add(axesHelper);

  const pen = new Pen(scene, networking);
  scene.add(pen);
};

//shapes
const material = new MeshBasicMaterial({
  color: 0x00ffff, //this.data.color,
  side: DoubleSide,
  flatShading: true,
});
const sphereGeometry = new SphereBufferGeometry(1, 12, 12);
const AddLocalSphere = (position, orientation, scale) => {
  var point = new Mesh(sphereGeometry, material);
  var sca = scale;
  point.scale.set(sca, sca, sca);
  point.position.copy(position);
  point.rotation.copy(orientation);

  scene.add(point);
};

networking.remoteSync.addEventListener("add", (destId, objectId, info) => {
  switch (info.type) {
    case "sphere":
      console.log("sphere");
      AddLocalSphere(
        info.posRotSca.position,
        info.posRotSca.rotation,
        info.posRotSca.scale
      );
    // const ball = new Ball(info.position, false); // only add RB once to fake server-client physics model
    // networking.remoteSync.addRemoteObject(destId, objectId, ball);
    // scene.add(ball);
    // break;

    default:
      return;
  }
});

scene.init();

export { scene };

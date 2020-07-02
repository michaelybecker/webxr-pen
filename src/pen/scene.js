// default scene loaded in src/engine/engine.js
import {
  Scene,
  AxesHelper,
  SphereBufferGeometry,
  MeshBasicMaterial,
  Mesh,
} from "three";

// import PeerConnection from "../engine/networking/PeerConnection";

import Pen from "./pen";

const scene = new Scene();
// const networking = new PeerConnection(scene);

scene.init = () => {
  var axesHelper = new AxesHelper(5);
  scene.add(axesHelper);

  const networking = "";
  const pen = new Pen(scene, networking);
  scene.add(pen);
};
const m = new Mesh(
  new SphereBufferGeometry(1, 13, 13),
  new MeshBasicMaterial({ color: 0xff00ff })
);
m.position.z -= 2;
scene.add(m);
// scene.Undo = () => {
//   console.log(scene.children[scene.children.length - 3]);
//   scene.remove(scene.children[scene.children.length - 3]);
// };
scene.init();

export { scene };

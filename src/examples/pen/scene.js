// default scene loaded in src/engine/engine.js
import { Scene, AxesHelper } from "three";

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

scene.init();

export { scene };

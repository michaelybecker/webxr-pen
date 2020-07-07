import { Scene, AxesHelper, AmbientLight } from "three";
import PeerConnection from "../engine/networking/PeerConnection";
import Pen from "./penxrpk-meshline";

const scene = new Scene();
const networking = new PeerConnection(scene);

scene.init = () => {
  scene.add(new AxesHelper(5));
  scene.add(new Pen(scene, networking));
  scene.add(new AmbientLight(0xffffff, 4));
};
scene.init();

export { scene };

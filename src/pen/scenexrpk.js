import * as Croquet from "@croquet/croquet";
import { Scene, AxesHelper, AmbientLight } from "three";
import Pen from "./penxrpk-meshline";

const scene = new Scene();
scene.add(new AxesHelper(5));
scene.add(new AmbientLight(0xffffff, 4));
scene.add(new Pen(scene));

export { scene };

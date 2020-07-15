import * as Croquet from "@croquet/croquet";
import * as Croquet from "@croquet/croquet";
import { Scene, AxesHelper, AmbientLight } from "three";
// import Pen from "./croquet-test";

const scene = new Scene();
scene.add(new AxesHelper(5));
scene.add(new AmbientLight(0xffffff, 4));
// scene.add(new Pen(scene));

class MyModel extends Croquet.Model {
  init() {
    this.count = 0;
    this.subscribe("counter", "reset", this.resetCounter);
    this.future(1000).tick();
  }

  resetCounter() {
    this.count = 0;
    this.publish("counter", "update", this.count);
  }

  tick() {
    this.count++;
    this.publish("counter", "update", this.count);
    this.future(1000).tick();
  }
}

MyModel.register();

var d = document.createElement("div");
d.id = "countDisplay";
d.style.zIndex = 1000;
document.body.appendChild(d);

class MyView extends Croquet.View {
  constructor(model) {
    super(model);
    const countDisplay = document.querySelector("#countDisplay");
    document.onclick = event => {
      this.publish("counter", "reset");
    };
    this.subscribe("counter", "update", this.handleUpdate);
  }

  handleUpdate(data) {
    countDisplay.textContent = data;
  }
}

Croquet.Session.join("hellobrim", MyModel, MyView);

export { scene };

import "./styles.css";
import { mountApp } from "./app";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Application root not found");
mountApp(root);

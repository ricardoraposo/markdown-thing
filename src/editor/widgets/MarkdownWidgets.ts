import { WidgetType, type EditorView } from "@codemirror/view";
import { toggleTask } from "../taskToggle";

export class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const bullet = document.createElement("span");
    bullet.className = "md-bullet";
    bullet.setAttribute("aria-hidden", "true");
    return bullet;
  }
}

export class DividerWidget extends WidgetType {
  toDOM(): HTMLElement {
    const divider = document.createElement("div");
    divider.className = "md-divider";
    divider.setAttribute("role", "separator");
    return divider;
  }
}

export class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly togglePos: number) {
    super();
  }

  eq(other: TaskWidget): boolean {
    return this.checked === other.checked && this.togglePos === other.togglePos;
  }

  toDOM(view: EditorView): HTMLElement {
    const checkbox = document.createElement("button");
    checkbox.type = "button";
    checkbox.className = "md-task-checkbox";
    checkbox.setAttribute("role", "checkbox");
    checkbox.setAttribute("aria-checked", String(this.checked));
    checkbox.setAttribute("aria-label", this.checked ? "Mark task incomplete" : "Mark task complete");
    checkbox.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleTask(view, this.togglePos);
      view.focus();
    });
    return checkbox;
  }
}

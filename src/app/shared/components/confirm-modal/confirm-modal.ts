import { Component, EventEmitter, Output } from "@angular/core";

@Component({
  selector: "app-confirm-modal",
  standalone: true,
  templateUrl: "./confirm-modal.html",
  styleUrls: ["./confirm-modal.css"],
})
export class ConfirmModalComponent {
  visible = false;

  title = "Confirm";
  message = "Are you sure?";

  confirmText = "Yes";
  cancelText = "No";

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  open(config: {
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
  }) {
    this.title = config.title || "Confirm";
    this.message = config.message || "Are you sure?";
    this.confirmText = config.confirmText || "Yes";
    this.cancelText = config.cancelText || "No";

    this.visible = true;
  }

  close() {
    this.visible = false;
  }

  onConfirm() {
    this.visible = false;
    this.confirmed.emit();
  }

  onCancel() {
    this.visible = false;
    this.cancelled.emit();
  }
}

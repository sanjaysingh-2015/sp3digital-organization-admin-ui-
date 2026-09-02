import { Injectable, signal } from '@angular/core';

@Injectable({providedIn:'root'})
export class UiService {
  toast = signal<string | null>(null);
  show(message: string) {
    this.toast.set(message);
    setTimeout(() => this.toast.set(null), 2800);
  }
}

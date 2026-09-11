import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../core/auth.service';
import { UiService } from '../core/ui.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  constructor(
    public readonly auth: AuthService,
    public readonly ui: UiService,
  ) {}

  get displayName(): string {
    const givenName = this.auth.givenName?.() ?? '';
    const familyName = this.auth.familyName?.() ?? '';
    const fullName = `${givenName} ${familyName}`.trim();

    return fullName || this.auth.userName?.() || 'User';
  }

  get initials(): string {
    const parts = this.displayName.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();

    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
}

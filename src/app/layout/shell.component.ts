import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { UiService } from '../core/ui.service';

@Component({
  selector:'app-shell',
  standalone:true,
  imports:[RouterOutlet, RouterLink, RouterLinkActive],
  template:`
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">SP3</div><div><b>SP3 Digital</b><small>Organization Admin</small></div></div>
      <nav>
        <a routerLink="/dashboard" routerLinkActive="active">▦ <span>Dashboard</span></a>
        <a routerLink="/onboarding" routerLinkActive="active">✦ <span>Get Started</span></a>
        <div class="nav-label">ORGANIZATION</div>
        <a routerLink="/users" routerLinkActive="active">♙ <span>Users</span></a>
        <a routerLink="/organizations" routerLinkActive="active">◉ <span>Organizations</span></a>
        <a routerLink="/facilities" routerLinkActive="active">◈ <span>Facilities</span></a>
        <a routerLink="/departments" routerLinkActive="active">◆ <span>Departments</span></a>
        <a routerLink="/facility-services" routerLinkActive="active">◇ <span>Facility Services</span></a>
      </nav>
      <div class="sidebar-foot">Tenant<br><strong>{{auth.tenantUuid() || 'JWT tenant claim'}}</strong></div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div><span class="eyebrow">ORGANIZATION PLATFORM</span><h1>Administration Console</h1></div>
        <div class="top-actions"><span class="status-dot"></span> Connected <button class="avatar" (click)="auth.clear()" title="Sign out">A</button></div>
      </header>
      @if (ui.toast()) { <div class="toast">{{ui.toast()}}</div> }
      <section class="content"><router-outlet /></section>
    </main>
  </div>`
})
export class ShellComponent {
  constructor(public auth: AuthService, public ui: UiService) {}
}

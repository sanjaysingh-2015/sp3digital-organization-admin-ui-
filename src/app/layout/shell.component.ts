import { Component, HostListener, signal } from '@angular/core';
import { NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../core/auth.service';
import { UiService } from '../core/ui.service';
import { PATIENT_PERMISSIONS } from '../core/patient-permissions';

interface NavLink {
  label: string;
  route: string;
  icon: string;
  // Hidden unless the signed-in user holds this permission.
  permission?: string;
}

interface NavGroup {
  label: string;
  icon: string;
  links: NavLink[];
  permission?: string;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  readonly topLinks: NavLink[] = [
    { label: 'Dashboard', route: '/dashboard', icon: '▦' },
    { label: 'Get Started', route: '/onboarding', icon: '✦' },
  ];

  readonly groups: NavGroup[] = [
    {
      label: 'Organization',
      icon: '◉',
      links: [
        { label: 'Users', route: '/users', icon: '♙' },
        { label: 'Organizations', route: '/organizations', icon: '◉' },
        { label: 'Facilities', route: '/facilities', icon: '◈' },
        { label: 'Departments', route: '/departments', icon: '◆' },
      ],
    },
    {
      label: 'Services',
      icon: '◇',
      links: [
        { label: 'Service Categories', route: '/service-categories', icon: '◇' },
        { label: 'Services', route: '/services', icon: '◇' },
        { label: 'Facility Services', route: '/facility-services', icon: '◇' },
      ],
    },
    {
      label: 'Providers',
      icon: '✚',
      links: [
        { label: 'Doctors', route: '/providers', icon: '✚' },
      ],
    },
    {
      label: 'Patients',
      icon: '♡',
      permission: PATIENT_PERMISSIONS.READ,
      links: [
        { label: 'Patients', route: '/patients', icon: '♡', permission: PATIENT_PERMISSIONS.READ },
      ],
    },
    {
      label: 'Schedules',
      icon: '▤',
      links: [
        { label: 'Slots', route: '/appointment-slot-configs', icon: '▤' },
        { label: 'Holidays / Weekly Offs', route: '/facility-closures', icon: '▧' },
      ],
    },
  ];

  /** Groups (and links) the signed-in user may see; patient data is hidden without its permission. */
  get visibleGroups(): NavGroup[] {
    return this.groups
      .filter((group) => !group.permission || this.auth.hasPermission(group.permission))
      .map((group) => ({ ...group, links: group.links.filter((link) => !link.permission || this.auth.hasPermission(link.permission)) }))
      .filter((group) => group.links.length > 0);
  }

  readonly openGroup = signal<string | null>(null);

  constructor(
    public readonly auth: AuthService,
    public readonly ui: UiService,
    private readonly router: Router,
  ) {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.openGroup.set(null);
      }
    });
  }

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

  isGroupActive(group: NavGroup): boolean {
    const url = this.router.url.split(/[?#]/)[0];
    return group.links.some((link) => url === link.route || url.startsWith(link.route + '/'));
  }

  toggleGroup(label: string, event: Event): void {
    event.stopPropagation();
    this.openGroup.update((current) => (current === label ? null : label));
  }

  closeGroup(): void {
    this.openGroup.set(null);
  }

  onGroupKeydown(label: string, event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.openGroup.set(null);
      return;
    }
    if (event.key === 'ArrowDown' && this.openGroup() !== label) {
      event.preventDefault();
      this.openGroup.set(label);
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeGroup();
  }
}

import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { ShellComponent } from './layout/shell.component';
import { LoginComponent } from './features/login/login.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'onboarding', loadComponent: () => import('./features/onboarding/onboarding.component').then(m => m.OnboardingComponent) },
      { path: 'organizations', loadComponent: () => import('./features/organizations/organizations.component').then(m => m.OrganizationsComponent) },
      { path: 'facilities', loadComponent: () => import('./features/facilities/facilities.component').then(m => m.FacilitiesComponent) },
      { path: 'departments', loadComponent: () => import('./features/departments/departments.component').then(m => m.DepartmentsComponent) },
      { path: 'facility-services', loadComponent: () => import('./features/facility-services/facility-services.component').then(m => m.FacilityServicesComponent) },
    ]
  },
  { path: '**', redirectTo: '' }
];

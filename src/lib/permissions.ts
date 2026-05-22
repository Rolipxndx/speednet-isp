import type { Profile } from '@/hooks/useAuth';

type MenuItem = {
  path: string;
  label: string;
  allowedRoles: Profile['role'][];
};

export const routePermissions: Record<string, Profile['role'][]> = {
  '/': ['admin', 'tecnico', 'cobrador'],
  '/clients': ['admin', 'tecnico', 'cobrador'],
  '/plans': ['admin'],
  '/payments': ['admin', 'cobrador'],
  '/billing': ['admin', 'cobrador'],
  '/export': ['admin'],
  '/tickets': ['admin', 'tecnico'],
  '/cuts': ['admin', 'tecnico'],
  '/inventory': ['admin', 'tecnico'],
  '/company': ['admin'],
  '/theme': ['admin', 'tecnico', 'cobrador'],
  '/backup/export': ['admin'],
  '/backup/restore': ['admin'],
};

export const menuItems: MenuItem[] = [
  { path: '/', label: 'Dashboard', allowedRoles: ['admin', 'tecnico', 'cobrador'] },
  { path: '/clients', label: 'Clientes', allowedRoles: ['admin', 'tecnico', 'cobrador'] },
  { path: '/plans', label: 'Planes', allowedRoles: ['admin'] },
  { path: '/payments', label: 'Pagos', allowedRoles: ['admin', 'cobrador'] },
  { path: '/billing', label: 'Facturación', allowedRoles: ['admin', 'cobrador'] },
  { path: '/export', label: 'Exportar CSV', allowedRoles: ['admin'] },
  { path: '/tickets', label: 'Servicio Técnico', allowedRoles: ['admin', 'tecnico'] },
  { path: '/cuts', label: 'Cortes', allowedRoles: ['admin', 'tecnico'] },
  { path: '/inventory', label: 'Inventario', allowedRoles: ['admin', 'tecnico'] },
  { path: '/company', label: 'Mi empresa', allowedRoles: ['admin'] },
  { path: '/theme', label: 'Tema', allowedRoles: ['admin', 'tecnico', 'cobrador'] },
  { path: '/backup/export', label: 'Exportar Backup', allowedRoles: ['admin'] },
  { path: '/backup/restore', label: 'Restaurar Backup', allowedRoles: ['admin'] },
];

export function canAccessRoute(path: string, role: Profile['role'] | null): boolean {
  if (!role) return false;
  const allowed = routePermissions[path];
  return allowed ? allowed.includes(role) : false;
}

export function getVisibleMenuItems(role: Profile['role'] | null) {
  if (!role) return [];
  return menuItems.filter(item => item.allowedRoles.includes(role));
}
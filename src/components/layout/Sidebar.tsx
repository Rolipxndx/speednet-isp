import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Wifi,
  CreditCard,
  FileText,
  Download,
  Wrench,
  Power,
  Package,
  Building2,
  Palette,
  Database,
  Upload,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { getVisibleMenuItems } from '@/lib/permissions';
import { useTheme } from '@/contexts/ThemeContext';

// Mapeo de rutas a iconos
const iconMap: Record<string, any> = {
  '/': LayoutDashboard,
  '/clients': Users,
  '/plans': Wifi,
  '/payments': CreditCard,
  '/billing': FileText,
  '/export': Download,
  '/tickets': Wrench,
  '/cuts': Power,
  '/inventory': Package,
  '/company': Building2,
  '/theme': Palette,
  '/backup/export': Database,
  '/backup/restore': Upload,
};

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export default function Sidebar({ collapsed, setCollapsed }: SidebarProps) {
  const { profile } = useAuth();
  // Obtenemos primaryColor en lugar de pageAccent
  const { primaryColor } = useTheme();
  const visibleItems = getVisibleMenuItems(profile?.role || null);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen bg-card border-r transition-all duration-300 flex flex-col',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Línea superior usando primaryColor */}
        <div className="h-1 w-full shrink-0" style={{ backgroundColor: primaryColor }} />

        <div className="flex h-14 items-center justify-between px-3 border-b">
          {!collapsed && (
            <span className="text-lg font-semibold tracking-tight">SpeedNet ISP</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-2">
          <ul className="space-y-1">
            {visibleItems.map((item) => {
              const Icon = iconMap[item.path] || LayoutDashboard;
              return (
                <li key={item.path}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <NavLink
                        to={item.path}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                            'hover:bg-accent hover:text-accent-foreground',
                            isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
                            collapsed && 'justify-center px-2'
                          )
                        }
                      >
                        <Icon className={cn('h-5 w-5', !collapsed && 'mr-3')} />
                        {!collapsed && <span>{item.label}</span>}
                      </NavLink>
                    </TooltipTrigger>
                    {collapsed && (
                      <TooltipContent side="right">
                        {item.label}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </TooltipProvider>
  );
}
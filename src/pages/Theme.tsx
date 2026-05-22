import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sun, Moon, Monitor, Check } from 'lucide-react';

const predefinedColors = [
  '#2563eb', // azul
  '#16a34a', // verde
  '#dc2626', // rojo
  '#7c3aed', // púrpura
  '#ea580c', // naranja
  '#6b7280', // gris
];

export default function Theme() {
  const { mode, setMode, primaryColor, setPrimaryColor } = useTheme();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-light tracking-tight">Personalizar Tema</h1>
        <p className="text-muted-foreground">
          Cambia el modo y el color principal de la interfaz
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sun className="h-5 w-5" />
              Modo de apariencia
            </CardTitle>
            <CardDescription>
              Selecciona el modo claro, oscuro o automático según tu sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              variant={mode === 'light' ? 'default' : 'outline'}
              onClick={() => setMode('light')}
              className="flex-1"
            >
              <Sun className="mr-2 h-4 w-4" />
              Claro
            </Button>
            <Button
              variant={mode === 'dark' ? 'default' : 'outline'}
              onClick={() => setMode('dark')}
              className="flex-1"
            >
              <Moon className="mr-2 h-4 w-4" />
              Oscuro
            </Button>
            <Button
              variant={mode === 'system' ? 'default' : 'outline'}
              onClick={() => setMode('system')}
              className="flex-1"
            >
              <Monitor className="mr-2 h-4 w-4" />
              Sistema
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full border" style={{ backgroundColor: primaryColor }} />
              Color primario
            </CardTitle>
            <CardDescription>
              Elige el color para la barra lateral y elementos destacados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-6 gap-2">
              {predefinedColors.map((color) => (
                <button
                  key={color}
                  onClick={() => setPrimaryColor(color)}
                  className={`h-10 w-10 rounded-full border-2 transition-all ${
                    primaryColor === color ? 'border-primary ring-2 ring-primary ring-offset-2' : 'border-muted'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                >
                  {primaryColor === color && <Check className="h-4 w-4 mx-auto text-white" />}
                </button>
              ))}
              <div className="relative h-10 w-10">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0"
                />
                <div
                  className="h-full w-full rounded-full border-2 border-muted"
                  style={{ backgroundColor: primaryColor }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
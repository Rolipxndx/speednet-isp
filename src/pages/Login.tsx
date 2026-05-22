import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
	console.log('🔑 Intentando login con:', email);
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      setError('Credenciales inválidas. Intenta de nuevo.');
    } else {
      navigate('/');
    }
    setLoading(false);
  };

  const fillDemo = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-light tracking-tight">SpeedNet ISP</CardTitle>
          <CardDescription>Sistema de Gestión</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="correo@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-300">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </Button>
          </form>

          <Separator className="my-6" />
          
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3 text-center">CUENTAS DE DEMOSTRACIÓN</p>
            <div className="grid grid-cols-3 gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-auto py-2 flex-col items-center"
                onClick={() => fillDemo('admin@net.com', 'admin123')}
              >
                <span className="font-semibold">Admin</span>
                <span className="text-xs text-muted-foreground">admin@net.com</span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-auto py-2 flex-col items-center"
                onClick={() => fillDemo('tech@net.com', 'tech123')}
              >
                <span className="font-semibold">Técnico</span>
                <span className="text-xs text-muted-foreground">tech@net.com</span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-auto py-2 flex-col items-center"
                onClick={() => fillDemo('colab@net.com', 'colab123')}
              >
                <span className="font-semibold">Colaborador</span>
                <span className="text-xs text-muted-foreground">colab@net.com</span>
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-center text-xs text-muted-foreground">
          SpeedNet ISP © 2026
        </CardFooter>
      </Card>
    </div>
  );
}
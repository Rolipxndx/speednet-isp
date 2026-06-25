import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
// Eliminamos la importación de ShieldCheck porque ya no se usa
// import { ShieldCheck } from 'lucide-react';

import fondoRobot from '../assets/login-bg.png';
import logoIcon from '../assets/logo-icon.png'; // <-- Importa tu imagen (cambia el nombre si es necesario)

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isCentered, setIsCentered] = useState(false);

  useEffect(() => {
    setIsCentered(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

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
    // Aplicamos Poppins a todo el componente mediante style inline
    <div 
      className="grid min-h-screen grid-cols-1 lg:grid-cols-2 bg-[#030712] text-slate-100"
      style={{ fontFamily: "'Poppins', ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* COLUMNA IZQUIERDA */}
      <div className="hidden lg:block relative overflow-hidden">
        <img
          src={fondoRobot}
          alt="Fondo SpeedNet"
          className="absolute inset-0 w-full h-full object-cover"
        />
        
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/60 to-black/30" />

        <div className="absolute inset-0 flex flex-col justify-center px-12 lg:px-16">
          <div className="max-w-lg">
            <h1 className="text-3xl lg:text-3xl font-bold leading-tight mb-6">
              VELOCIDAD QUE <br />
              CONECTA <span className="text-[#189668]">AL FUTURO</span>
            </h1>
           </div>
        </div>

        <div className="relative w-3/4 h-64">
          <div
            className={`absolute top-1/2 transition-all duration-700 ease-out ${
              isCentered
                ? 'left-1/2 -translate-x-1/2'
                : 'left-0 translate-x-0'
            } -translate-y-1/2`}
          >
            <div className="flex items-center gap-3 text-white">
              <div className="w-16 h-16 bg-[#189668] rounded-full flex items-center justify-center">
                <span className="text-4xl font-bold text-[#F2CA50]">S</span>
              </div>
              <div>
                <p className="font-bold text-6xl tracking-tight text-[#F2CA50]">SpeedNet</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* COLUMNA DERECHA: Formulario */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-gradient-to-b from-[#070f1e] to-[#030712]">
        <Card className="w-full max-w-md bg-[#0b1528]/90 border-emerald-900/30 backdrop-blur-xl shadow-2xl shadow-emerald-950/20 text-slate-100">
          <CardHeader className="space-y-2 text-center pt-8">
            {/* Reemplazo del ShieldCheck por la imagen */}
           <div className="mx-auto h-16 w-16 rounded-full overflow-hidden bg-[#F2CA50]/10 mb-2">
			<img 
			src={logoIcon} 
				alt="Logo SpeedNet" 
			className="h-full w-full object-cover" 
			/>
			</div>
            <CardTitle className="text-3xl font-extrabold tracking-tight text-[#F2CA50]">
              Panel de Gestión
            </CardTitle>
            <CardDescription className="text-[#96A3BD]">
              Ingresa al sistema de administración
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white font-medium">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="correo@speednet.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 bg-[#030712]/70 border-slate-700 text-slate-100 placeholder:text-slate-500 focus-visible:ring-emerald-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-white font-medium">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 bg-[#030712]/70 border-slate-700 text-slate-100 placeholder:text-slate-500 focus-visible:ring-emerald-500"
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-950/40 border border-red-900/50 p-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-[#A11515] to-[#A11515] text-[#F2CA50] hover:from-emerald-500 hover:to-teal-400 transition-all duration-200 shadow-lg"
                disabled={loading}
              >
                {loading ? 'Validando...' : 'Iniciar Sesión'}
              </Button>
            </form>

            <Separator className="my-6 bg-slate-800/60" />

            <div>
              <p className="text-xs font-semibold tracking-wider text-slate-500 mb-3 text-center uppercase">
                Accesos de prueba
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => fillDemo('admin@net.com', 'admin123')}>
                  Admin
                </Button>
                <Button variant="outline" size="sm" onClick={() => fillDemo('tech@net.com', 'tech123')}>
                  Técnico
                </Button>
                <Button variant="outline" size="sm" onClick={() => fillDemo('colab@net.com', 'colab123')}>
                  Colab
                </Button>
              </div>
            </div>
          </CardContent>

          <CardFooter className="justify-center text-xs text-slate-600 pb-6">
            SpeedNet ISP © 2026
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
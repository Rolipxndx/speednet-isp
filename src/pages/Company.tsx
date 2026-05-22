import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Loader2,
  Building2,
  Users,
  Save,
  UserPlus,
  Pencil,
  Trash2,
  ShieldAlert, // Importante para el botón de contraseña
} from 'lucide-react';

// Schemas
const companySchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email('Correo inválido').optional().nullable(),
  tax_id: z.string().optional().nullable(),
  slogan: z.string().optional().nullable(),
  invoice_prefix: z.string().optional().nullable(),
});

type CompanyFormData = z.infer<typeof companySchema>;

const userSchema = z.object({
  email: z.string().email('Correo válido requerido'),
  full_name: z.string().min(1, 'Nombre requerido'),
  role: z.enum(['admin', 'tecnico', 'cobrador']),
  is_active: z.boolean().optional(),
});

type UserFormData = z.infer<typeof userSchema>;

type UserProfile = {
  user_id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'tecnico' | 'cobrador';
  is_active: boolean;
  created_at: string;
};

export default function Company() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [openUserDialog, setOpenUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userToDeactivate, setUserToDeactivate] = useState<UserProfile | null>(null); // Mantenido si se usa para desactivación lógica suave
  const [saving, setSaving] = useState(false);

  // Obtener configuración de empresa
  const { data: company, isLoading: loadingCompany } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Obtener usuarios
  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ['system-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
    
      if (error) throw error;
    
      return data.map((p: any) => ({
        user_id: p.id,
        email: p.email || '',
        full_name: p.full_name,
        role: p.role,
        is_active: p.is_active,
        created_at: p.created_at,
      })) as UserProfile[];
    },
  });

  // Formularios
  const companyForm = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    values: {
      name: company?.name || '',
      address: company?.address || '',
      city: company?.city || '',
      phone: company?.phone || '',
      email: company?.email || '',
      tax_id: company?.tax_id || '',
      slogan: company?.slogan || '',
      invoice_prefix: company?.invoice_prefix || 'FACT-',
    },
  });

  const userForm = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      email: '',
      full_name: '',
      role: 'cobrador',
      is_active: true,
    },
  });

  // Guardar datos de empresa
  const saveCompany = async (data: CompanyFormData) => {
    setSaving(true);
    const { error } = await supabase
      .from('company_settings')
      .upsert({ id: 1, ...data }, { onConflict: 'id' });
    setSaving(false);
    if (error) {
      alert('Error al guardar: ' + error.message);
    } else {
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      alert('Datos guardados correctamente');
    }
  };

  // Guardar usuario (crear o editar)
  const saveUser = async (data: UserFormData) => {
    if (editingUser) {
      const { error } = await supabase.rpc('update_user_profile', {
        p_user_id: editingUser.user_id,
        p_full_name: data.full_name,
        p_role: data.role,
        p_email: data.email,
        p_is_active: data.is_active ?? true,
      });
      if (error) {
        alert('Error al actualizar: ' + error.message);
        return;
      }
      alert('Usuario actualizado correctamente');
    } else {
      const password = prompt('Ingrese una contraseña temporal para el usuario (mínimo 6 caracteres):');
      if (!password || password.length < 6) {
        alert('Contraseña inválida');
        return;
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: password,
        options: {
          data: { full_name: data.full_name },
        },
      });
      if (signUpError) {
        alert('Error al crear usuario: ' + signUpError.message);
        return;
      }
      if (signUpData.user) {
        const { error: rpcError } = await supabase.rpc('update_user_profile', {
          p_user_id: signUpData.user.id,
          p_full_name: data.full_name,
          p_role: data.role,
          p_email: data.email,
          p_is_active: data.is_active ?? true,
        });
        if (rpcError) {
          alert('Usuario creado pero no se pudo asignar el rol: ' + rpcError.message);
        } else {
          alert('Usuario creado correctamente');
        }
      }
    }
    queryClient.invalidateQueries({ queryKey: ['system-users'] });
    setOpenUserDialog(false);
    setEditingUser(null);
    userForm.reset();
  };

  // --- NUEVAS FUNCIONES SOLICITADAS ---

  // Función para cambiar contraseña
  const handleChangePassword = async (userId: string, fullName: string) => {
    const newPassword = prompt(`Nueva contraseña para ${fullName} (mínimo 6 caracteres):`);
    
    if (!newPassword) return;
    if (newPassword.length < 6) {
      alert("La contraseña es muy corta.");
      return;
    }

    const { error } = await supabase.rpc('admin_reset_user_password', {
      p_user_id: userId,
      p_new_password: newPassword
    });

    if (error) {
      alert("Error al cambiar contraseña: " + error.message);
    } else {
      alert("Contraseña actualizada con éxito.");
    }
  };

  // Función para eliminar permanentemente
  const handleDeleteUser = async (userId: string, fullName: string) => {
    const confirmFirst = confirm(`¿Estás seguro de eliminar a ${fullName}? Esta acción no se puede deshacer y borrará todo su acceso.`);
    if (!confirmFirst) return;

    const { error } = await supabase.rpc('delete_system_user', {
      p_user_id: userId
    });

    if (error) {
      alert("Error al eliminar: " + error.message);
    } else {
      queryClient.invalidateQueries({ queryKey: ['system-users'] });
      alert("Usuario eliminado correctamente.");
    }
  };

  // -----------------------------------

  // Desactivar usuario (borrado lógico)
  const deactivateUser = async () => {
    if (!userToDeactivate) return;
    const { error } = await supabase.rpc('deactivate_user', {
      p_user_id: userToDeactivate.user_id,
    });
    if (error) {
      alert('Error al desactivar usuario: ' + error.message);
    } else {
      queryClient.invalidateQueries({ queryKey: ['system-users'] });
      setUserToDeactivate(null);
      alert('Usuario desactivado. Ya no podrá iniciar sesión.');
    }
  };

  // Handlers
  const handleEditUser = (user: UserProfile) => {
    setEditingUser(user);
    userForm.reset({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
    });
    setOpenUserDialog(true);
  };

  const handleAddNewUser = () => {
    setEditingUser(null);
    userForm.reset({
      email: '',
      full_name: '',
      role: 'cobrador',
      is_active: true,
    });
    setOpenUserDialog(true);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin': return <Badge>Administrador</Badge>;
      case 'tecnico': return <Badge variant="secondary">Técnico</Badge>;
      case 'cobrador': return <Badge variant="outline">Cobrador</Badge>;
      default: return null;
    }
  };

  const getActiveBadge = (isActive: boolean) => {
    return isActive ? (
      <Badge variant="default">Activo</Badge>
    ) : (
      <Badge variant="destructive">Inactivo</Badge>
    );
  };

  if (loadingCompany || loadingUsers) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-light tracking-tight">Mi Empresa</h1>
        <p className="text-muted-foreground">
          Configura los datos de tu empresa y gestiona los usuarios del sistema
        </p>
      </div>

      <Tabs defaultValue="company" className="space-y-6">
        <TabsList>
          <TabsTrigger value="company">
            <Building2 className="mr-2 h-4 w-4" />
            Datos de la Empresa
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="mr-2 h-4 w-4" />
            Usuarios del Sistema
          </TabsTrigger>
        </TabsList>

        {/* Pestaña Empresa */}
        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle>Información de la empresa</CardTitle>
              <CardDescription>
                Estos datos aparecerán en los recibos y facturas generados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={companyForm.handleSubmit(saveCompany)} className="space-y-4 max-w-2xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="name">Nombre de la Empresa *</Label>
                    <Input id="name" {...companyForm.register('name')} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="address">Dirección</Label>
                    <Input id="address" {...companyForm.register('address')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Ciudad</Label>
                    <Input id="city" {...companyForm.register('city')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input id="phone" {...companyForm.register('phone')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Correo</Label>
                    <Input id="email" type="email" {...companyForm.register('email')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax_id">RUC / RNC / NIT</Label>
                    <Input id="tax_id" {...companyForm.register('tax_id')} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="slogan">Slogan</Label>
                    <Input id="slogan" {...companyForm.register('slogan')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoice_prefix">Prefijo de factura</Label>
                    <Input id="invoice_prefix" {...companyForm.register('invoice_prefix')} />
                  </div>
                </div>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="mr-2 h-4 w-4" />
                  Guardar datos
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pestaña Usuarios */}
        <TabsContent value="users">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Usuarios del sistema</CardTitle>
                <CardDescription>
                  {users?.length || 0} usuario(s) registrado(s)
                </CardDescription>
              </div>
              <Button onClick={handleAddNewUser}>
                <UserPlus className="mr-2 h-4 w-4" />
                Agregar Usuario
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Correo</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((user) => (
                    <TableRow key={user.user_id}>
                      <TableCell className="font-medium">{user.full_name || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell>{getActiveBadge(user.is_active)}</TableCell>
                      
                      {/* TABLA ACTUALIZADA CON NUEVOS BOTONES */}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {/* EDITAR PERFIL */}
                          <Button variant="ghost" size="icon" onClick={() => handleEditUser(user)} title="Editar perfil">
                            <Pencil className="h-4 w-4" />
                          </Button>

                          {/* CAMBIAR CONTRASEÑA */}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleChangePassword(user.user_id, user.full_name)}
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            title="Cambiar contraseña"
                          >
                            <ShieldAlert className="h-4 w-4" />
                          </Button>

                          {/* ELIMINAR PERMANENTE */}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDeleteUser(user.user_id, user.full_name)}
                            className="text-destructive hover:bg-destructive/10"
                            title="Eliminar permanentemente"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                      {/* ------------------------------------ */}
                      
                    </TableRow>
                  ))}
                  {users?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No hay usuarios registrados
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Diálogo de usuario (crear/editar) */}
      <Dialog open={openUserDialog} onOpenChange={setOpenUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar Usuario' : 'Agregar Usuario'}</DialogTitle>
            <DialogDescription>
              {editingUser ? 'Modifica los datos del usuario.' : 'Crea una nueva cuenta.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={userForm.handleSubmit(saveUser)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Nombre completo *</Label>
              <Input id="full_name" {...userForm.register('full_name')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico *</Label>
              <Input id="email" type="email" {...userForm.register('email')} disabled={!!editingUser} />
              {editingUser && (
                <p className="text-xs text-muted-foreground">El correo no se puede cambiar.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rol *</Label>
              <Select
                value={userForm.watch('role')}
                onValueChange={(value: 'admin' | 'tecnico' | 'cobrador') => userForm.setValue('role', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="tecnico">Técnico</SelectItem>
                  <SelectItem value="cobrador">Cobrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editingUser && (
              <div className="flex items-center space-x-2">
                <Label htmlFor="is_active">Usuario activo</Label>
                <input
                  type="checkbox"
                  id="is_active"
                  checked={userForm.watch('is_active') ?? true}
                  onChange={(e) => userForm.setValue('is_active', e.target.checked)}
                />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenUserDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                <UserPlus className="mr-2 h-4 w-4" />
                {editingUser ? 'Guardar cambios' : 'Crear usuario'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo de desactivación (Opcional, si decides mantener la opción de desactivar sin borrar) */}
      <AlertDialog open={!!userToDeactivate} onOpenChange={() => setUserToDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{userToDeactivate?.full_name}</strong> dejará de poder iniciar sesión, pero sus registros se conservarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deactivateUser} className="bg-destructive hover:bg-destructive/90">
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
// Nuevas importaciones para el Tooltip
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// 1. Esquema actualizado con 'description'
const planSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  download_speed: z.coerce.number().min(1, "Debe ser mayor a 0"),
  upload_speed: z.coerce.number().min(1, "Debe ser mayor a 0"),
  price: z.coerce.number().min(1, "Debe ser mayor a 0"),
  is_active: z.boolean().default(true),
  description: z.string().optional().default('') // <-- AGREGA ESTA LÍNEA EXACTA
});

type PlanFormData = z.infer<typeof planSchema>;

// 2. Interfaz actualizada
type Plan = {
  id: string;
  name: string;
  download_speed: number;
  upload_speed: number;
  price: number;
  description: string | null; // Agregado aquí
  is_active: boolean;
  created_at: string;
};

export default function Plans() {
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planToDelete, setPlanToDelete] = useState<Plan | null>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Plan[];
    },
  });

  const form = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: '',
      download_speed: 0,
      upload_speed: 0,
      price: 0,
      description: '', // Valor inicial vacío
      is_active: true,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: PlanFormData) => {
      if (editingPlan) {
        const { error } = await supabase
          .from('plans')
          .update(data)
          .eq('id', editingPlan.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('plans').insert([data]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setOpenDialog(false);
      setEditingPlan(null);
      form.reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setPlanToDelete(null);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('plans')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
  });

  const onSubmit = (data: PlanFormData) => {
    mutation.mutate(data);
  };

  const handleEdit = (plan: Plan) => {
    setEditingPlan(plan);
    form.reset({
      name: plan.name,
      download_speed: plan.download_speed,
      upload_speed: plan.upload_speed,
      price: plan.price,
      description: plan.description || '', // Cargar descripción al editar
      is_active: plan.is_active,
    });
    setOpenDialog(true);
  };

  const handleAddNew = () => {
    setEditingPlan(null);
    form.reset({
      name: '',
      download_speed: 0,
      upload_speed: 0,
      price: 0,
      description: '',
      is_active: true,
    });
    setOpenDialog(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-tight">Planes de Internet</h1>
          <p className="text-muted-foreground"> Administra los planes para tus clientes </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo Plan
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Planes registrados</CardTitle>
          <CardDescription> {plans?.length || 0} plan(es) en total </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Descarga</TableHead>
                <TableHead>Subida</TableHead>
                <TableHead>Precio</TableHead>
                {/* 3. Nueva columna "Extras" en la cabecera */}
                <TableHead>Extras</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans?.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell>{plan.download_speed} Mbps</TableCell>
                  <TableCell>{plan.upload_speed} Mbps</TableCell>
                  <TableCell>${plan.price.toFixed(2)}</TableCell>
                  
                  {/* 4. Nueva celda con Tooltip para la descripción */}
                  <TableCell>
                    {plan.description ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="cursor-help">Ver</Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{plan.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={plan.is_active}
                        onCheckedChange={(checked) =>
                          toggleActiveMutation.mutate({ id: plan.id, is_active: checked })
                        }
                        disabled={toggleActiveMutation.isPending}
                      />
                      <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                        {plan.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(plan)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setPlanToDelete(plan)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Editar Plan' : 'Nuevo Plan'}</DialogTitle>
            <DialogDescription> Completa los datos del plan </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del plan</Label>
              <Input id="name" {...form.register('name')} placeholder="Ej: Básico 10 Mbps" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="download_speed">Bajada (Mbps)</Label>
                <Input id="download_speed" type="number" {...form.register('download_speed')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="upload_speed">Subida (Mbps)</Label>
                <Input id="upload_speed" type="number" {...form.register('upload_speed')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Precio mensual ($)</Label>
              <Input id="price" type="number" step="0.01" {...form.register('price')} />
            </div>

            {/* 5. Nuevo campo de entrada para la descripción en el formulario */}
            <div className="space-y-2">
              <Label htmlFor="description">Descripción / Promociones (opcional)</Label>
              <Input
                id="description"
                {...form.register('description')}
                placeholder="Ej: Incluye HBO Max sin costo adicional"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={form.watch('is_active')}
                onCheckedChange={(checked) => form.setValue('is_active', checked)}
              />
              <Label htmlFor="is_active">Plan activo</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingPlan ? 'Guardar cambios' : 'Crear plan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* AlerDialog para eliminar queda igual... */}
      <AlertDialog open={!!planToDelete} onOpenChange={() => setPlanToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el plan "{planToDelete?.name}" permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => planToDelete && deleteMutation.mutate(planToDelete.id)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
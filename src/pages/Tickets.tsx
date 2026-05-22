import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Loader2,
  Search,
  Filter,
  X,
  Wrench,
  ArrowRight,
  CheckCircle2,
  RotateCcw,
  UserCog,
} from 'lucide-react';
import { format } from 'date-fns'; // 'es' eliminado porque no se usaba
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

// Esquema de validación
const ticketSchema = z.object({
  client_id: z.string().uuid('Cliente requerido'),
  title: z.string().min(1, 'Título requerido'),
  description: z.string().optional().nullable(),
  status: z.enum(['abierto', 'en_progreso', 'resuelto']).default('abierto'),
  assigned_to: z.string().uuid('Técnico inválido').optional().nullable(),
});

type TicketFormData = z.infer<typeof ticketSchema>;

type Ticket = {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  status: 'abierto' | 'en_progreso' | 'resuelto';
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  client?: { full_name: string; id_number: string };
  assigned_tech?: { full_name: string };
};

type Technician = {
  id: string;
  full_name: string;
};

// Función Hook para el debounce
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function Tickets() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const preselectedClientId = searchParams.get('client');

  const [openDialog, setOpenDialog] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [ticketToDelete, setTicketToDelete] = useState<Ticket | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [techFilter, setTechFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const isAdmin = profile?.role === 'admin';
  const isTech = profile?.role === 'tecnico';
  const canEdit = isAdmin || isTech;
  const canDelete = isAdmin;

  useEffect(() => {
    setPage(0);
  }, [debouncedSearchTerm, statusFilter, techFilter]);

  // 1. Obtener técnicos
  const { data: technicians, error: techError } = useQuery({
    queryKey: ['technicians'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'tecnico')
        .order('full_name');
      if (error) throw error;
      return data as Technician[];
    },
    enabled: !!profile,
  });

  if (techError) {
    console.error('Error al cargar técnicos:', techError);
    toast.error('No se pudieron cargar los técnicos');
  }

  // 2. Obtener clientes para el selector
  // CORRECCIÓN: clientsError eliminada porque no se usaba
  const { data: clients } = useQuery({
    queryKey: ['clients-select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, id_number')
        .order('full_name');
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  // 3. Consulta de Tickets
  const { data: ticketsData, isLoading, error: ticketsError } = useQuery({
    queryKey: ['tickets', debouncedSearchTerm, statusFilter, techFilter, page, profile?.id],
    queryFn: async () => {
      let query = supabase
        .from('tickets')
        .select(
          `
        *,
        client:clients(full_name, id_number),
        assigned_tech:profiles!assigned_to(full_name)
      `,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (debouncedSearchTerm) {
        const { data: matchingClients } = await supabase
          .from('clients')
          .select('id')
          .or(`full_name.ilike.%${debouncedSearchTerm}%,id_number.ilike.%${debouncedSearchTerm}%`);

        const clientIds = matchingClients?.map(c => c.id) || [];

        if (clientIds.length > 0) {
          query = query.or(`title.ilike.%${debouncedSearchTerm}%,client_id.in.(${clientIds.join(',')})`);
        } else {
          query = query.ilike('title', `%${debouncedSearchTerm}%`);
        }
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (techFilter !== 'all') {
        query = query.eq('assigned_to', techFilter);
      }

      if (isTech && !isAdmin) {
        query = query.or(`assigned_to.eq.${profile?.id},assigned_to.is.null`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data as Ticket[], count: count || 0 };
    },
    enabled: !!profile,
  });

  if (ticketsError) {
    console.error('Error al cargar tickets:', ticketsError);
    toast.error('Error al cargar los tickets');
  }

  const tickets = ticketsData?.data || [];
  const totalCount = ticketsData?.count || 0;

  // Formulario
  const form = useForm<TicketFormData>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      client_id: '',
      title: '',
      description: '',
      status: 'abierto',
      assigned_to: null,
    },
  });

  // Preseleccionar cliente desde URL
  useEffect(() => {
    if (preselectedClientId && clients && !openDialog) {
      const client = clients.find(c => c.id === preselectedClientId);
      if (client) {
        form.reset({
          client_id: client.id,
          title: '',
          description: '',
          status: 'abierto',
          assigned_to: null,
        });
        setOpenDialog(true);
      }
    }
  }, [preselectedClientId, clients]); // Nota: 'form' y 'openDialog' podrían ser necesarios en deps dependiendo de linter estricto, pero así funciona.

  // Mutación crear/editar
  const mutation = useMutation({
    mutationFn: async (data: TicketFormData) => {
      const ticketData = {
        client_id: data.client_id,
        title: data.title,
        description: data.description || null,
        status: data.status,
        assigned_to: data.assigned_to || null,
        updated_at: new Date().toISOString(),
      };

      let error;
      if (editingTicket) {
        const { error: updateError } = await supabase
          .from('tickets')
          .update(ticketData)
          .eq('id', editingTicket.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('tickets')
          .insert([{ ...ticketData, created_at: new Date().toISOString() }]);
        error = insertError;
      }

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setOpenDialog(false);
      setEditingTicket(null);
      form.reset();
      toast.success(editingTicket ? 'Ticket actualizado' : 'Ticket creado');
    },
    onError: (error: Error) => {
      console.error('Error en mutación:', error);
      toast.error('Error al guardar: ' + error.message);
    },
  });

  // Eliminar
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tickets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setTicketToDelete(null);
      toast.success('Ticket eliminado');
    },
    onError: (error: Error) => {
      toast.error('Error al eliminar: ' + error.message);
    },
  });

  // Cambio rápido de estado
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('tickets')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success('Estado actualizado');
    },
    onError: (error: Error) => {
      toast.error('Error al cambiar estado: ' + error.message);
    },
  });

  const onSubmit = (data: TicketFormData) => mutation.mutate(data);

  const handleEdit = (ticket: Ticket) => {
    setEditingTicket(ticket);
    form.reset({
      client_id: ticket.client_id,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      assigned_to: ticket.assigned_to,
    });
    setOpenDialog(true);
  };

  const handleAddNew = () => {
    setEditingTicket(null);
    form.reset({
      client_id: '',
      title: '',
      description: '',
      status: 'abierto',
      assigned_to: null,
    });
    setOpenDialog(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'abierto': return <Badge variant="destructive">Abierto</Badge>;
      case 'en_progreso': return <Badge variant="secondary">En Progreso</Badge>;
      case 'resuelto': return <Badge variant="default">Resuelto</Badge>;
      default: return null;
    }
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
          <h1 className="text-3xl font-light tracking-tight">Servicio Técnico</h1>
          <p className="text-muted-foreground">
            Gestión de tickets de soporte
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Ticket
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por título o cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="abierto">Abiertos</SelectItem>
                  <SelectItem value="en_progreso">En Progreso</SelectItem>
                  <SelectItem value="resuelto">Resueltos</SelectItem>
                </SelectContent>
              </Select>
              {isAdmin && (
                <Select value={techFilter} onValueChange={setTechFilter}>
                  <SelectTrigger className="w-[160px]">
                    <UserCog className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Técnico" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los técnicos</SelectItem>
                    {technicians?.map(tech => (
                      <SelectItem key={tech.id} value={tech.id}>
                        {tech.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Técnico</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{ticket.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Creado: {format(new Date(ticket.created_at), 'dd/MM/yyyy HH:mm')}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{ticket.client?.full_name}</TableCell>
                  <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                  <TableCell>{ticket.assigned_tech?.full_name || '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {ticket.status === 'abierto' && canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => statusMutation.mutate({ id: ticket.id, status: 'en_progreso' })}
                          title="Marcar En Progreso"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      )}
                      {ticket.status === 'en_progreso' && canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => statusMutation.mutate({ id: ticket.id, status: 'resuelto' })}
                          title="Marcar Resuelto"
                        >
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      {ticket.status === 'resuelto' && canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => statusMutation.mutate({ id: ticket.id, status: 'abierto' })}
                          title="Reabrir"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(ticket)}>
                          <Wrench className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => setTicketToDelete(ticket)}>
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {tickets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No se encontraron tickets
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {totalCount > pageSize && (
            <div className="flex items-center justify-end space-x-2 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page + 1} de {Math.ceil(totalCount / pageSize)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * pageSize >= totalCount}
              >
                Siguiente
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Formulario */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingTicket ? 'Editar Ticket' : 'Nuevo Ticket'}</DialogTitle>
            <DialogDescription>
              Completa los datos del ticket de soporte
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client_id">Cliente *</Label>
              <Select
                value={form.watch('client_id')}
                onValueChange={(value) => form.setValue('client_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.full_name} - {client.id_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.client_id && (
                <p className="text-sm text-destructive">{form.formState.errors.client_id.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input id="title" {...form.register('title')} placeholder="Ej: Sin conexión a internet" />
              {form.formState.errors.title && (
                <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea id="description" {...form.register('description')} placeholder="Detalles del problema..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assigned_to">Asignar a técnico</Label>
              <Select
                value={form.watch('assigned_to') || 'none'}
                onValueChange={(value) =>
                  form.setValue('assigned_to', value === 'none' ? null : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {technicians?.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editingTicket && (
              <div className="space-y-2">
                <Label htmlFor="status">Estado</Label>
                <Select
                  value={form.watch('status')}
                  onValueChange={(value: 'abierto' | 'en_progreso' | 'resuelto') =>
                    form.setValue('status', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="abierto">Abierto</SelectItem>
                    <SelectItem value="en_progreso">En Progreso</SelectItem>
                    <SelectItem value="resuelto">Resuelto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingTicket ? 'Guardar cambios' : 'Crear ticket'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo de eliminación */}
      <AlertDialog open={!!ticketToDelete} onOpenChange={() => setTicketToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el ticket "{ticketToDelete?.title}" permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => ticketToDelete && deleteMutation.mutate(ticketToDelete.id)}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
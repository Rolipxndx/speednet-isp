import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Power, Clock } from 'lucide-react'; // AlertTriangle eliminado
import { format, differenceInDays } from 'date-fns'; // 'es' eliminado
import { useDebounce } from '@/hooks/useDebounce';

type SuspendedClient = {
  id: string;
  full_name: string;
  id_number: string;
  phone: string;
  plan?: { name: string; price: number };
  last_cut?: {
    reason: string;
    created_at: string;
  };
};

export default function Cuts() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [clientToReconnect, setClientToReconnect] = useState<SuspendedClient | null>(null);
  const [reconnectOpen, setReconnectOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const isAdminOrTech = profile?.role === 'admin' || profile?.role === 'tecnico';

  // Obtener clientes suspendidos con último corte
  const { data: suspendedClients, isLoading } = useQuery({
    queryKey: ['suspended-clients', debouncedSearch],
    queryFn: async () => {
      // 1. Clientes suspendidos
      let query = supabase
        .from('clients')
        .select('id, full_name, id_number, phone, plan:plans(name, price)')
        .eq('status', 'suspendido')
        .order('full_name');

      if (debouncedSearch) {
        query = query.or(
          `full_name.ilike.%${debouncedSearch}%,id_number.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`
        );
      }

      const { data: clients, error } = await query;
      if (error) throw error;
      if (!clients || clients.length === 0) return [];

      // 2. Obtener el último corte de cada cliente suspendido
      const clientIds = clients.map(c => c.id);
      const { data: cuts, error: cutsError } = await supabase
        .from('service_cuts')
        .select('client_id, reason, created_at')
        .in('client_id', clientIds)
        .eq('action', 'corte')
        .order('created_at', { ascending: false });

      if (cutsError) throw cutsError;

      // Asignar el último corte a cada cliente
      const withLastCut = clients.map(client => {
        const lastCut = cuts?.find(cut => cut.client_id === client.id);
        return {
          ...client,
          last_cut: lastCut ? { reason: lastCut.reason, created_at: lastCut.created_at } : undefined,
        };
      });

      return withLastCut as SuspendedClient[];
    },
  });

  // Historial global de cortes/reconexiones (últimos 20)
  const { data: cutHistory } = useQuery({
    queryKey: ['cuts-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_cuts')
        .select('id, client:clients(full_name), action, reason, created_at, performed_by')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: showHistory,
  });

  // Mutación de reconexión
  const reconnectMutation = useMutation({
    mutationFn: async (clientId: string) => {
      // 1. Actualizar estado del cliente
      const { error: updateError } = await supabase
        .from('clients')
        .update({ status: 'activo' })
        .eq('id', clientId);
      if (updateError) throw updateError;

      // 2. Registrar la reconexión
      const { error: cutError } = await supabase.from('service_cuts').insert({
        client_id: clientId,
        action: 'reconexion',
        reason: null,
        performed_by: profile?.id,
      });
      if (cutError) throw cutError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suspended-clients'] });
      queryClient.invalidateQueries({ queryKey: ['cuts-history'] });
      setReconnectOpen(false);
      setClientToReconnect(null);
    },
  });

  const handleReconnect = () => {
    if (clientToReconnect) {
      reconnectMutation.mutate(clientToReconnect.id);
    }
  };

  // Calcular días desde la suspensión
  const getDaysSuspended = (cutDate: string | undefined) => {
    if (!cutDate) return '—';
    const days = differenceInDays(new Date(), new Date(cutDate));
    return `${days} día(s)`;
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
          <h1 className="text-3xl font-light tracking-tight">Cortes</h1>
          <p className="text-muted-foreground">
            Clientes con servicio suspendido y su historial
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowHistory(!showHistory)}
        >
          <Clock className="mr-2 h-4 w-4" />
          {showHistory ? 'Ocultar historial' : 'Ver historial'}
        </Button>
      </div>

      {/* Tabla de suspendidos */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, cédula o teléfono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <CardDescription>
              {suspendedClients?.length || 0} cliente(s) suspendido(s)
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Suspendido desde</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suspendedClients?.map(client => (
                <TableRow key={client.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{client.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {client.id_number}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {/* CORRECCIÓN: Acceso seguro usando [0] */}
                    {client.plan?.[0]?.name || '—'}
                    {client.plan?.[0]?.price && (
                      <span className="text-xs text-muted-foreground ml-1">
                        (${client.plan[0].price})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{client.phone}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {getDaysSuspended(client.last_cut?.created_at)}
                      </Badge>
                      {client.last_cut?.created_at && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(client.last_cut.created_at), 'dd/MM/yyyy')}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {client.last_cut?.reason || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdminOrTech && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setClientToReconnect(client);
                          setReconnectOpen(true);
                        }}
                        disabled={reconnectMutation.isPending}
                      >
                        <Power className="mr-2 h-4 w-4 text-green-600" />
                        Reconectar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {suspendedClients?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No hay clientes suspendidos
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Historial global */}
      {showHistory && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Historial de cortes y reconexiones</CardTitle>
            <CardDescription>Últimos 20 movimientos</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cutHistory?.map(record => (
                  <TableRow key={record.id}>
                    <TableCell>{(record as any).client?.full_name}</TableCell>
                    <TableCell>
                      <Badge variant={record.action === 'corte' ? 'destructive' : 'default'}>
                        {record.action === 'corte' ? 'Corte' : 'Reconexión'}
                      </Badge>
                    </TableCell>
                    <TableCell>{record.reason || '—'}</TableCell>
                    <TableCell>
                      {format(new Date(record.created_at), 'dd/MM/yyyy HH:mm')}
                    </TableCell>
                  </TableRow>
                ))}
                {(!cutHistory || cutHistory.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No hay registros
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Diálogo de confirmación de reconexión */}
      <AlertDialog open={reconnectOpen} onOpenChange={setReconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reconectar servicio</AlertDialogTitle>
            <AlertDialogDescription>
              {clientToReconnect && (
                <>
                  ¿Estás seguro de reconectar a <strong>{clientToReconnect.full_name}</strong>?
                  <br />
                  El servicio pasará a estado <Badge variant="default">Activo</Badge>.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReconnect}
              disabled={reconnectMutation.isPending}
            >
              {reconnectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
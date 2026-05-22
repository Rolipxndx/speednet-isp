import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Loader2, Download, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';

// 1. ORDEN PARA EXPORTAR (Todas tus tablas reales de SpeedNet)
const tablesToExport = [
  'company_settings',
  'plans',
  'profiles', // Respaldamos roles para no perder configuraciones de usuarios
  'clients',
  'contracts',
  'payments',
  'tickets',
  'service_cuts',
  'inventory',
  'invoices',
];

// 2. ORDEN PARA ELIMINAR (De tablas dependientes/hijas a tablas maestras)
// ⚠️ NOTA: Excluimos 'profiles' para garantizar que nunca pierdas tu sesión ni tu rol de admin.
const tablesToDeleteOrder = [
  'invoices',
  'inventory',
  'service_cuts',
  'tickets',
  'payments',
  'contracts',
  'clients',
  'plans',
  'company_settings',
];

// 3. ORDEN PARA INSERTAR (De tablas maestras a tablas dependientes/hijas)
const tablesToInsertOrder = [
  'company_settings',
  'plans',
  'clients',
  'contracts',
  'payments',
  'tickets',
  'service_cuts',
  'inventory',
  'invoices',
];

export default function Backup() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Exportar todas las tablas a un archivo JSON local
  const handleExport = async () => {
    setExporting(true);
    setStatusMessage('Generando copia de seguridad...');
    try {
      const backup: Record<string, any[]> = {};
      
      for (const table of tablesToExport) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) {
          console.warn(`Saltando exportación de la tabla ${table}: ${error.message}`);
          continue;
        }
        backup[table] = data || [];
      }

      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `speednet_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setStatusMessage('Backup descargado con éxito.');
    } catch (err: any) {
      alert('Error al exportar: ' + err.message);
      setStatusMessage(null);
    } finally {
      setExporting(false);
    }
  };

  // Capturar el archivo seleccionado por el usuario
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setRestoreFile(file);
      setShowConfirm(true);
    }
    e.target.value = ''; // Resetea el input para permitir re-subidas del mismo archivo
  };

  // Restaurar la Base de Datos con validación estricta paso a paso
  const handleRestore = async () => {
    if (!restoreFile) return;
    setImporting(true);
    setStatusMessage('Leyendo archivo de respaldo...');
    
    try {
      const text = await restoreFile.text();
      const backup = JSON.parse(text);

      // VALIDACIÓN: Verificar que el JSON tenga contenido legible
      if (!backup || Object.keys(backup).length === 0) {
        throw new Error('El archivo JSON está vacío o no es un formato válido de SpeedNet.');
      }

      // PASO 1: Limpieza en cascada (Vaciamos de tablas hijas a maestras)
      for (const table of tablesToDeleteOrder) {
        setStatusMessage(`Limpiando tabla actual: ${table}...`);
        
        // .not('id', 'is', null) limpia de forma segura llaves UUID e INTEGER consecutivamente
        const { error: deleteError } = await supabase
          .from(table)
          .delete()
          .not('id', 'is', null); 
          
        if (deleteError) {
          if (deleteError.message.includes('schema cache') || deleteError.code === 'PGRST116') {
            console.warn(`La tabla ${table} no existe físicamente en Supabase. Saltando limpieza.`);
            continue;
          }
          throw new Error(`No se pudo vaciar la tabla [${table}]: ${deleteError.message}`);
        }
      }

      // PASO 2: Inserción controlada con verificación de escritura real
      for (const table of tablesToInsertOrder) {
        const rows = backup[table];
        
        if (!rows) {
          console.warn(`La tabla [${table}] no venía incluida en el archivo JSON.`);
          continue;
        }

        if (rows.length === 0) {
          console.info(`La tabla [${table}] venía en el backup pero tiene 0 registros.`);
          continue;
        }

        setStatusMessage(`Insertando en ${table} (${rows.length} registros)...`);
        console.log(`Escribiendo registros en [${table}]:`, rows);

        // Intentamos la inserción masiva en Supabase
        const { error: insertError } = await supabase.from(table).insert(rows);
        
        if (insertError) {
          throw new Error(
            `Error al reescribir la tabla [${table}]: ${insertError.message}\n` +
            `Detalle: ${insertError.details || 'Verifica si las políticas de seguridad RLS impiden la inserción masiva desde la web.'}`
          );
        }
      }

      setStatusMessage('¡Restauración completada con éxito!');
      alert('El backup se ha restaurado correctamente. Toda la información de SpeedNet ha sido recuperada.');
    } catch (err: any) {
      console.error('Error crítico durante el proceso:', err);
      alert('🔴 ERROR CRÍTICO DURANTE LA RESTAURACIÓN:\n\n' + err.message);
      setStatusMessage('La restauración falló.');
    } finally {
      setImporting(false);
      setShowConfirm(false);
      setRestoreFile(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-light tracking-tight">Backup y Restauración</h1>
        <p className="text-muted-foreground">
          Gestiona copias de seguridad locales de la base de datos de SpeedNet
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* CARD: EXPORTAR */}
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Exportar Backup
            </CardTitle>
            <CardDescription>
              Descarga un archivo estructurado JSON con tus configuraciones, clientes, planes, facturas e inventario actual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExport} disabled={exporting || importing} className="w-full">
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Generar y Descargar JSON
            </Button>
          </CardContent>
        </Card>

        {/* CARD: RESTAURAR */}
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Restaurar Sistema
            </CardTitle>
            <CardDescription>
              Sube una copia de seguridad en formato JSON. <span className="text-destructive font-medium">Atención:</span> Esto reemplazará de forma irreversible todo el estado actual del ISP.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex flex-col items-center justify-center w-full h-10 px-4 rounded-md border border-input bg-background text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors">
              <span className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Seleccionar archivo de respaldo
              </span>
              <input
                type="file"
                accept=".json"
                onChange={handleFileChange}
                disabled={exporting || importing}
                className="hidden"
              />
            </label>
          </CardContent>
        </Card>
      </div>

      {/* MENSAJES DE ESTADO EN PANTALLA */}
      {statusMessage && (
        <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-muted text-muted-foreground animate-pulse">
          <CheckCircle2 className="h-4 w-4 text-primary animate-none" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* DIÁLOGO DE ALERTA DE CONFIRMACIÓN */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              ¿Confirmas la restauración total?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 pt-2">
              <p>
                Estás a punto de cargar el archivo: <strong className="text-foreground">{restoreFile?.name}</strong>.
              </p>
              <p className="bg-destructive/10 text-destructive border border-destructive/20 p-3 rounded-md text-xs">
                <strong>ADVERTENCIA:</strong> Este proceso borrará de forma inmediata todas tus tablas vigentes de cobros, clientes e inventario en Supabase para reescribirlas. Si el proceso se interrumpe, el sistema podría quedar incompleto.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setRestoreFile(null); setShowConfirm(false); }}>
              Abortar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRestore} 
              className="bg-destructive hover:bg-destructive/90 text-white"
              disabled={importing}
            >
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Sí, Reemplazar Datos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
using System;
using System.Threading;
using System.Windows.Forms;

namespace MetroRailwayLauncher;

static class Program
{
    private static readonly Mutex mutex = new Mutex(true, "{MetroRailwayKolkataStaffAttendanceERPLauncherMutex}");

    [STAThread]
    static void Main()
    {
        // Validate single instance lock
        if (!mutex.WaitOne(TimeSpan.Zero, true))
        {
            MessageBox.Show("An instance of Metro Railway S&T ERP is already running!", "Instance Running", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        try
        {
            ApplicationConfiguration.Initialize();
            Application.Run(new MainForm());
        }
        finally
        {
            mutex.ReleaseMutex();
        }
    }
}
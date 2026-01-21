
# Add types immediately
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Enable DPI awareness
$user32 = Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();' -Name "Win32" -Namespace Win32 -PassThru
$user32::SetProcessDPIAware()

$code = @'
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);
'@

try {
    $API = Add-Type -MemberDefinition $code -Name 'KeyUtils' -Namespace 'Win32' -PassThru
} catch {
    $API = [Win32.KeyUtils]
}

# Values passed as arguments: output directory
$outDir = $args[0]
if (-not $outDir) { $outDir = $PWD }

Write-Output "LISTENER_STARTED"

function Take-Screenshot {
    try {
        $screen = [System.Windows.Forms.Screen]::PrimaryScreen
        $bounds = $screen.Bounds
        $width = $bounds.Width
        $height = $bounds.Height
        
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmssfff"
        $filename = "screenshot_$timestamp.png"
        $path = Join-Path $outDir $filename
        
        $bitmap = New-Object System.Drawing.Bitmap($width, $height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
        $bitmap.Save($path)
        $graphics.Dispose()
        $bitmap.Dispose()
        
        # Output special format for main app to parse
        Write-Output "CAPTURE_SUCCESS:$path"
    } catch {
        Write-Output "CAPTURE_ERROR:$($_.Exception.Message)"
    }
}

while ($true) {
    # VK_CONTROL = 0x11, VK_SHIFT = 0x10, S = 0x53
    $ctrl = $API::GetAsyncKeyState(0x11) -band 0x8000
    $shift = $API::GetAsyncKeyState(0x10) -band 0x8000
    $s = $API::GetAsyncKeyState(0x53) -band 0x8000

    if ($ctrl -and $shift -and $s) {
        Write-Output "HOTKEY_PRESSED"
        Start-Sleep -Milliseconds 1000
    }
    
    # F = 0x46
    $f = $API::GetAsyncKeyState(0x46) -band 0x8000
    if ($ctrl -and $shift -and $f) {
        Write-Output "HOTKEY_PRESSED_MOBILE"
        Start-Sleep -Milliseconds 1000
    }
    Start-Sleep -Milliseconds 50
}

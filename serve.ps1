param([int]$Port = 8081)

$root = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript'; '.css' = 'text/css'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'; '.json' = 'application/json'
  '.wav' = 'audio/wav'; '.mp3' = 'audio/mpeg'; '.ogg' = 'audio/ogg'; '.ico' = 'image/x-icon'
}

$shutdown = $null
$previewLock = $null
$ownsPreviewLock = $false
$listener = New-Object System.Net.HttpListener

try {
  if ($Port -ge 8080 -and $Port -le 8089) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $key = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($root.ToUpperInvariant()))) }
    finally { $sha.Dispose() }
    $previewLock = [Threading.Mutex]::new($false, "Local\FalconDive-$key-preview")
    $shutdown = [Threading.EventWaitHandle]::new($false, [Threading.EventResetMode]::ManualReset, "Local\FalconDive-$key-stop")
    try {
      $ownsPreviewLock = $previewLock.WaitOne(0)
      if (-not $ownsPreviewLock) {
        Write-Host 'Stopping the existing Falcon Dive preview on 808x'
        [void]$shutdown.Set()
        $ownsPreviewLock = $previewLock.WaitOne(5000)
      }
    } catch [Threading.AbandonedMutexException] {
      $ownsPreviewLock = $true
    }
    if (-not $ownsPreviewLock) { throw 'The existing Falcon Dive preview did not stop within five seconds.' }
    [void]$shutdown.Reset()
  }

  Write-Host "Starting server on port $Port"
  $listener.Prefixes.Add("http://localhost:$Port/")
  $listener.Start()
  Write-Host "Serving $root at http://localhost:$Port/"

  while ($listener.IsListening) {
    if ($shutdown) {
      $pending = $listener.BeginGetContext($null, $null)
      $requestReady = $pending.AsyncWaitHandle
      try {
        if ([Threading.WaitHandle]::WaitAny(@($shutdown, $requestReady)) -eq 0) { break }
        $ctx = $listener.EndGetContext($pending)
      } finally {
        if (-not $pending.IsCompleted) { $listener.Close() }
        $requestReady.Dispose()
      }
    } else {
      $ctx = $listener.GetContext()
    }
    $res = $ctx.Response
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
      if ($rel -eq '') { $rel = 'index.html' }
      $path = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $rel))
      # Reject anything resolving outside the served folder (path traversal)
      if (-not $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not [IO.File]::Exists($path)) {
        $res.StatusCode = 404
      } else {
        $bytes = [IO.File]::ReadAllBytes($path)
        $ext = [IO.Path]::GetExtension($path).ToLower()
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-store')
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    } catch {
      $res.StatusCode = 500
    } finally {
      $res.Close()
    }
  }
} finally {
  $listener.Close()
  if ($ownsPreviewLock) { $previewLock.ReleaseMutex() }
  if ($shutdown) { $shutdown.Dispose() }
  if ($previewLock) { $previewLock.Dispose() }
}

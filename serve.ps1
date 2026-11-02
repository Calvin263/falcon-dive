param([int]$Port = 8081)

$root = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript'; '.css' = 'text/css'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'; '.json' = 'application/json'
  '.wav' = 'audio/wav'; '.mp3' = 'audio/mpeg'; '.ogg' = 'audio/ogg'; '.ico' = 'image/x-icon'
}

Write-Host "Starting server on port $Port"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
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
  $listener.Stop()
}

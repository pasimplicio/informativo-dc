<#
.SYNOPSIS
    Apaga a publicacao de um contato no informativo.

.DESCRIPTION
    Remove o historico publicado de um indicador. A conversa volta a exibir o
    dado de exemplo ate o workflow correspondente publicar de novo.

    Serve para tirar mensagens de teste da conversa. O token nao fica no
    script nem no historico do terminal: e pedido na hora, oculto, ou lido de
    $env:INFORMATIVO_TOKEN.

.EXAMPLE
    .\limpar-teste.ps1
    Apaga a conversa "cortes" (padrao).

.EXAMPLE
    .\limpar-teste.ps1 -Contato faturamento

.EXAMPLE
    .\limpar-teste.ps1 -Todos
    Apaga os quatro. Pede confirmacao.
#>

[CmdletBinding()]
param(
    [ValidateSet('arrecadacao', 'faturamento', 'cortes', 'ordens')]
    [string]$Contato = 'cortes',

    [switch]$Todos,

    [string]$Uri = 'https://informativo-dc.sistemaspsdev.com.br'
)

$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 nao negocia TLS 1.2 por padrao em algumas maquinas.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$alvos = if ($Todos) { @('arrecadacao', 'faturamento', 'cortes', 'ordens') } else { @($Contato) }

if ($Todos) {
    Write-Host ""
    Write-Host "  Isto apaga os informativos publicados dos QUATRO indicadores." -ForegroundColor Yellow
    $r = Read-Host "  Digite APAGAR para confirmar"
    if ($r -ne 'APAGAR') {
        Write-Host "  Cancelado." -ForegroundColor Gray
        exit 0
    }
}

# ---------------------------------------------------------------- token ----

$token = $env:INFORMATIVO_TOKEN

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host ""
    Write-Host "  NAO edite este arquivo para colar o token." -ForegroundColor Yellow
    Write-Host "  Ele vai para o GitHub, que e publico." -ForegroundColor Yellow
    Write-Host ""

    # Prompt na propria chamada do Read-Host: com o aviso em Write-Host
    # separado, a linha de entrada aparece sozinha e ja levou a colar o token
    # dentro do arquivo.
    $seguro = Read-Host -Prompt "  Cole o INFORMATIVO_TOKEN aqui no terminal e tecle Enter" -AsSecureString

    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try {
        $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "  Token vazio. Abortado." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------- envio ----

$falhou = $false

foreach ($alvo in $alvos) {
    $corpo = @{ contato = $alvo; limpar = $true } | ConvertTo-Json -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($corpo)

    try {
        Invoke-RestMethod -Method Post -Uri "$Uri/api/publicar" `
            -Headers @{ Authorization = "Bearer $token" } `
            -ContentType 'application/json; charset=utf-8' `
            -Body $bytes | Out-Null

        Write-Host "  apagado  $alvo" -ForegroundColor Green
    }
    catch {
        # O corpo do erro vem em ErrorDetails: o Invoke-RestMethod ja consumiu
        # o stream da resposta, e le-lo de novo devolve vazio.
        $detalhe = $null
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $detalhe = $_.ErrorDetails.Message }
        elseif ($_.Exception.Response) {
            try {
                $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
                $detalhe = $sr.ReadToEnd(); $sr.Close()
            } catch { }
        }

        Write-Host "  FALHOU   $alvo" -ForegroundColor Red
        if ($detalhe) { Write-Host "           $detalhe" -ForegroundColor Red }
        else { Write-Host "           $($_.Exception.Message)" -ForegroundColor Red }
        $falhou = $true
    }
}

Write-Host ""
if ($falhou) {
    Write-Host "  'Token invalido'  -> o token digitado nao e o que esta na Vercel" -ForegroundColor Yellow
    Write-Host "  'No token found'  -> falta Redeploy na Vercel" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "  A conversa volta ao dado de exemplo ate o workflow publicar de novo." -ForegroundColor Cyan
Write-Host ""

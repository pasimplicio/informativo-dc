<#
.SYNOPSIS
    Publica um informativo de teste no site, para validar o caminho que o n8n
    vai usar.

.DESCRIPTION
    Faz o mesmo POST /api/publicar que o workflow fara. Serve para conferir
    token, Blob Store e a exibicao na tela antes de mexer no n8n.

    O token nao fica no script nem no historico do terminal: e pedido na hora,
    oculto, ou lido de $env:INFORMATIVO_TOKEN.

.EXAMPLE
    .\publicar-teste.ps1

.EXAMPLE
    .\publicar-teste.ps1 -Contato faturamento -Mensagem "*Teste* do faturamento"

.EXAMPLE
    # Apaga a publicacao de teste, voltando a tela para os dados de exemplo
    .\publicar-teste.ps1 -Limpar
#>

[CmdletBinding()]
param(
    [ValidateSet('arrecadacao', 'faturamento', 'cortes', 'ordens')]
    [string]$Contato = 'cortes',

    [string]$Mensagem = "*TESTE DE PUBLICACAO*`nSe voce esta lendo isto no site, o caminho ate a Vercel funciona.`n`nEsta mensagem foi enviada pelo script publicar-teste.ps1 e sera substituida pelo informativo real assim que o workflow rodar.",

    [string]$Uri = 'https://informativo-dc.sistemaspsdev.com.br',

    [switch]$Limpar
)

$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 nao negocia TLS 1.2 por padrao em algumas maquinas.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ---------------------------------------------------------------- token ----

$token = $env:INFORMATIVO_TOKEN

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host ""
    Write-Host "Cole o INFORMATIVO_TOKEN (nao aparece na tela):" -ForegroundColor Cyan
    $seguro = Read-Host -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try {
        $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "Token vazio. Abortado." -ForegroundColor Red
    exit 1
}

# ----------------------------------------------------------------- envio ---

if ($Limpar) {
    $Mensagem = ""
}

$corpo = @{
    contato   = $Contato
    mensagem  = $Mensagem
    gerado_em = (Get-Date).ToString('o')
} | ConvertTo-Json -Compress

# UTF-8 explicito: sem isto os acentos chegam corrompidos ao servidor.
$bytes = [Text.Encoding]::UTF8.GetBytes($corpo)

$destino = "$Uri/api/publicar"

Write-Host ""
Write-Host "Publicando em $destino" -ForegroundColor Gray
Write-Host "  contato : $Contato"
Write-Host "  tamanho : $($Mensagem.Length) caracteres"
Write-Host ""

try {
    $r = Invoke-RestMethod -Method Post -Uri $destino `
        -Headers @{ Authorization = "Bearer $token" } `
        -ContentType 'application/json; charset=utf-8' `
        -Body $bytes

    Write-Host "PUBLICADO" -ForegroundColor Green
    $r | Format-List
    Write-Host "Abra $Uri/informativo e veja a conversa '$Contato'." -ForegroundColor Cyan
    Write-Host ""
}
catch {
    # O corpo do erro vem em ErrorDetails: neste ponto o Invoke-RestMethod ja
    # consumiu o stream da resposta, entao lê-lo de novo devolve vazio e
    # sobraria so o texto generico do .NET ("O servidor remoto retornou (401)").
    $detalhe = $null
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        $detalhe = $_.ErrorDetails.Message
    }
    elseif ($_.Exception.Response) {
        try {
            $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
            $detalhe = $sr.ReadToEnd()
            $sr.Close()
        } catch { }
    }

    Write-Host "FALHOU" -ForegroundColor Red
    if ($detalhe) { Write-Host $detalhe -ForegroundColor Red }
    else { Write-Host $_.Exception.Message -ForegroundColor Red }

    Write-Host ""
    Write-Host "Causas comuns:" -ForegroundColor Yellow
    Write-Host "  'No token found'   -> Blob Store conectado, mas falta Redeploy na Vercel"
    Write-Host "  'Token invalido'   -> o token digitado nao e o que esta na Vercel"
    Write-Host "  'nao configurado'  -> INFORMATIVO_TOKEN ausente nas variaveis do projeto"
    Write-Host ""
    exit 1
}

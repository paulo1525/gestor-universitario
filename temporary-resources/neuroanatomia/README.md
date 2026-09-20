# Recursos temporários de Neuroanatomia

Estes ficheiros foram colocados temporariamente no ramo de implementação para apoiar o desenvolvimento das áreas de Materiais e Anki. Não são assets destinados ao bundle final da aplicação.

## Conteúdo

- `Neuroanatomia_AT1_AT5_AP1_AP3_PACK_ESSENCIAL_FINAL.apkg`
- `Neuroanatomia_AT1_AT5_AP1_AP3_PACK_COMPLETO_FINAL.apkg`
- `Bibliografia_Neuro_AT1_AT5_AP1_AP3_FINAL_WINDOWS_SAFE.zip.part00`
- `Bibliografia_Neuro_AT1_AT5_AP1_AP3_FINAL_WINDOWS_SAFE.zip.part01`
- `Bibliografia_Neuro_AT1_AT5_AP1_AP3_FINAL_WINDOWS_SAFE.zip.part02`

O ZIP original foi dividido porque excede o limite de tamanho individual de ficheiros do GitHub.

## Reconstrução do ZIP

### Linux/macOS/Git Bash

```bash
cat Bibliografia_Neuro_AT1_AT5_AP1_AP3_FINAL_WINDOWS_SAFE.zip.part* > Bibliografia_Neuro_AT1_AT5_AP1_AP3_FINAL_WINDOWS_SAFE.zip
```

### PowerShell

```powershell
$parts = Get-ChildItem "Bibliografia_Neuro_AT1_AT5_AP1_AP3_FINAL_WINDOWS_SAFE.zip.part*" | Sort-Object Name
$output = [System.IO.File]::Create("Bibliografia_Neuro_AT1_AT5_AP1_AP3_FINAL_WINDOWS_SAFE.zip")
foreach ($part in $parts) {
  $bytes = [System.IO.File]::ReadAllBytes($part.FullName)
  $output.Write($bytes, 0, $bytes.Length)
}
$output.Dispose()
```

## SHA-256

```text
69ccd037c5afd0a229f2f58d536afc29c98ce804e9387c870ea3dcad89d0d6cf  Bibliografia_Neuro_AT1_AT5_AP1_AP3_FINAL_WINDOWS_SAFE.zip.part00
d805371e60447b15f9b4409889993a668126eb9bb5f6d560dd3d0a9b8a297315  Bibliografia_Neuro_AT1_AT5_AP1_AP3_FINAL_WINDOWS_SAFE.zip.part01
920c5516638ca0f44fe355fe920ce1ebd4ccf4789de83dc9d72d2dffc758fadb  Bibliografia_Neuro_AT1_AT5_AP1_AP3_FINAL_WINDOWS_SAFE.zip.part02
a59c4addb772d08f97d828de8e0ffa2291ce327aa25887a6154cdb488e07756f  Neuroanatomia_AT1_AT5_AP1_AP3_PACK_COMPLETO_FINAL.apkg
da717fcfdd2c34c3c6e8c7dd0d48dccf116ff8adb212453a80238af09477ff88  Neuroanatomia_AT1_AT5_AP1_AP3_PACK_ESSENCIAL_FINAL.apkg
```

Estes recursos não devem ser removidos sem autorização explícita do proprietário do projeto.

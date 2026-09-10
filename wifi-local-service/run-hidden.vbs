' Chay "node server.js" AN (khong hien cua so console den nhap nhay) - dung boi shortcut trong
' thu muc Startup cua Windows de Dich vu Wi-Fi cuc bo tu dong chay ngam moi lan dang nhap,
' khong can bam start-wifi-service.bat thu cong nua. Xem install-autostart.ps1/.bat.
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir
shell.Run "cmd /c node server.js", 0, False

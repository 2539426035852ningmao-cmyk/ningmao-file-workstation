Set fs = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = fs.GetParentFolderName(WScript.ScriptFullName)
node = shell.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe")
If Not fs.FileExists(node) Then node = "node.exe"
runner = fs.BuildPath(root, "start-test.mjs")
q = Chr(34)
args = ""
windowStyle = 0
If fs.GetBaseName(WScript.ScriptFullName) = "Start-Room-Host" Then args = " --desktop-only"
If fs.GetBaseName(WScript.ScriptFullName) = "Start-Account-Station" Then
  args = " --station-only"
  windowStyle = 1
End If
On Error Resume Next
result = shell.Run(q & node & q & " " & q & runner & q & args, windowStyle, True)
If Err.Number <> 0 Or result <> 0 Then
  MsgBox "The transfer preview could not start. Open test-data\launch.log for details. Node.js 24 and WebView2 are required.", 16, "Ningmao Transfer Preview"
End If

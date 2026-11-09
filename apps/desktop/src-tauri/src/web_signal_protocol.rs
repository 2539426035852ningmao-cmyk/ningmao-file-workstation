//! W2 signaling envelope is metadata-only. It never carries file bytes, local
//! filesystem paths, source tickets, or Windows device credentials.
use serde_json::{Value, json};

pub fn valid_id(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok()
}
fn valid_candidate(payload: &Value) -> bool {
    let Some(candidate)=payload.get("candidate").and_then(Value::as_object) else {return false;};
    if candidate.get("candidate").and_then(Value::as_str).is_none_or(|v|v.len()>4000) {return false;}
    if candidate.get("sdpMid").is_some_and(|v|!v.is_null()&&!v.is_string()) {return false;}
    if candidate.get("sdpMLineIndex").is_some_and(|v|!v.is_null()&&!v.as_u64().is_some_and(|n|n<=65535)) {return false;}
    true
}
fn valid_description(payload: &Value) -> bool {
    let Some(description)=payload.get("description").and_then(Value::as_object) else {return false;};
    matches!(description.get("type").and_then(Value::as_str),Some("offer"|"answer")) &&
      description.get("sdp").and_then(Value::as_str).is_some_and(|s|s.len()<=12_000)
}
/// Native bridge is deliberately fail-closed: until a user-facing accept flow
/// is wired, it can decline an invitation, but cannot accept, send invites or
/// declare a file verified or saved.
pub fn validated_outgoing(value: &Value, own_id: &str) -> Option<String> {
    let object=value.as_object()?;
    if object.len()!=3 {return None;}
    let kind=object.get("type")?.as_str()?;
    let to=object.get("to")?.as_str()?;
    if !valid_id(to)||to==own_id {return None;}
    let payload=object.get("payload")?;
    let id=payload.get("id")?.as_str()?;
    if !valid_id(id) {return None;}
    let valid=match kind {
        "description"=>valid_description(payload),
        "candidate"=>valid_candidate(payload),
        "cancel"=>true,
        "decision"=>payload.get("accepted").and_then(Value::as_bool)==Some(false),
        _=>false
    };
    if !valid {return None;}
    let serialized=json!({"type":kind,"to":to,"payload":payload}).to_string();
    (serialized.len()<=16_384).then_some(serialized)
}
/// For Tauri UI: only signaling primitives; this never grants access to a
/// native filesystem operation. The UI must still bind task_id/from peers.
pub fn validated_incoming(value:&Value,own_id:&str)->Option<Value>{
    let object=value.as_object()?;
    if object.len()!=3{return None;}
    let kind=object.get("type")?.as_str()?;
    let from=object.get("from")?.as_str()?;
    if !valid_id(from)||from==own_id{return None;}
    let payload=object.get("payload")?;
    let id=payload.get("id")?.as_str()?;
    if !valid_id(id){return None;}
    let valid=match kind{
        "description"=>valid_description(payload),
        "candidate"=>valid_candidate(payload),
        "cancel"=>true,
        "decision"=>payload.get("accepted").is_some_and(Value::is_boolean),
        "receipt"=>payload.get("ok").and_then(Value::as_bool)==Some(true),
        _=>false
    };
    valid.then(||json!({"type":kind,"from":from,"payload":payload}))
}
#[cfg(test)]
mod tests{
    use super::*;
    const ME:&str="28560890-e97d-4fab-83c8-937b816d10cd";
    const PEER:&str="18aba838-246f-4d0e-af08-1a27b536932a";
    const TASK:&str="91276c8a-f330-4c07-bd2e-654bdbe9dedb";
    #[test]
    fn rejects_file_bytes_secrets_paths_invites_and_fake_receipts(){
        let allowed=json!({"type":"decision","to":PEER,"payload":{"id":TASK,"accepted":false}});
        assert!(validated_outgoing(&allowed,ME).is_some());
        for kind in ["invite","receipt","accepted","file","save"]{
            let bad=json!({"type":kind,"to":PEER,"payload":{"id":TASK,"accepted":true}});
            assert!(validated_outgoing(&bad,ME).is_none());
        }
        let bad=json!({"type":"decision","to":PEER,"payload":{"id":TASK,"accepted":true}});
        assert!(validated_outgoing(&bad,ME).is_none());
        let with_secret=json!({"type":"cancel","to":PEER,"payload":{"id":TASK},"token":"secret"});
        assert!(validated_outgoing(&with_secret,ME).is_none());
        assert!(validated_outgoing(&json!({"type":"cancel","to":ME,"payload":{"id":TASK}}),ME).is_none());
        assert!(validated_outgoing(&json!({"type":"candidate","to":PEER,"payload":{"id":TASK,"candidate":{"candidate":"x".repeat(4001)}}}),ME).is_none());
    }
    #[test]
    fn metadata_only_rtc_exchange_is_supported(){
        let description=json!({"type":"description","to":PEER,"payload":{"id":TASK,"description":{"type":"offer","sdp":"v=0"}}});
        let sent=validated_outgoing(&description,ME).unwrap();
        assert!(sent.contains("v=0"));
        assert!(!sent.contains("token"));
        assert!(validated_incoming(&json!({"type":"description","from":PEER,"payload":{"id":TASK,"description":{"type":"answer","sdp":"v=0"}}}),ME).is_some());
        assert!(validated_incoming(&json!({"type":"invite","from":PEER,"payload":{"id":TASK}}),ME).is_none());
    }
}

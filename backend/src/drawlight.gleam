import gleam/erlang/process
import gleam/http
import gleam/json
import gleam/dynamic/decode
import mist
import simplifile
import wisp
import wisp/wisp_mist

/// A local-only PoC backend. Do not publish its unauthenticated write API.
pub fn main() {
  wisp.configure_logger()

  let assert Ok(_) =
    wisp_mist.handler(handle_request, wisp.random_string(64))
    |> mist.new
    |> mist.bind("127.0.0.1")
    |> mist.port(8000)
    |> mist.start

  wisp.log_info("Drawlight Gleam API listening on 127.0.0.1:8000")
  process.sleep_forever()
}

fn handle_request(req: wisp.Request) -> wisp.Response {
  use <- wisp.log_request(req)
  case req.method, wisp.path_segments(req) {
    http.Get, ["health"] ->
      wisp.json_response("{\"ok\":true,\"runtime\":\"gleam\"}", 200)

    http.Get, ["diagram"] ->
      case simplifile.read(from: "./drawlight.json") {
        Ok(content) -> wisp.json_response(content, 200)
        Error(_) -> wisp.not_found()
      }

    http.Get, ["workspace"] ->
      case simplifile.read(from: "./drawlight-workspace.json") {
        Ok(content) -> wisp.json_response(content, 200)
        Error(_) -> wisp.not_found()
      }

    http.Put, ["workspace"] -> {
      use body <- wisp.require_string_body(req)
      let version_decoder = {
        use version <- decode.field("version", decode.int)
        decode.success(version)
      }
      case json.parse(body, version_decoder) {
        Ok(1) ->
          case simplifile.write(to: "./drawlight-workspace.json", contents: body) {
            Ok(_) -> wisp.json_response("{\"saved\":true}", 200)
            Error(_) -> wisp.internal_server_error()
          }
        _ -> wisp.bad_request("Expected Drawlight workspace JSON version 1")
      }
    }

    http.Put, ["diagram"] -> {
      use body <- wisp.require_string_body(req)
      // The editor validates the full model; the backend checks the JSON
      // syntax and document version before storing the snapshot.
      let version_decoder = {
        use version <- decode.field("version", decode.int)
        decode.success(version)
      }
      case json.parse(body, version_decoder) {
        Ok(2) ->
          case simplifile.write(to: "./drawlight.json", contents: body) {
            Ok(_) -> wisp.json_response("{\"saved\":true}", 200)
            Error(_) -> wisp.internal_server_error()
          }
        _ -> wisp.bad_request("Expected Drawlight JSON version 2")
      }
    }

    _, _ -> wisp.not_found()
  }
}

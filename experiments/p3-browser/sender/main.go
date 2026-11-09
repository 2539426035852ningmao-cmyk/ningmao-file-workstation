package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"strconv"
	"time"

	"github.com/schollz/croc/v11/src/codephrase"
	"github.com/schollz/croc/v11/src/croc"
	log "github.com/schollz/croc/v11/src/logger"
)

type request struct {
	Relay    string   `json:"relay"`
	Password string   `json:"password"`
	Code     string   `json:"code"`
	Paths    []string `json:"paths"`
}
type event struct {
	Version int    `json:"version"`
	Phase   string `json:"phase"`
	Files   int    `json:"files"`
	Total   int64  `json:"total"`
}

func validate(r request) (int64, error) {
	host, port, err := net.SplitHostPort(r.Relay)
	if err != nil || host != "127.0.0.1" {
		return 0, fmt.Errorf("loopback relay required")
	}
	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		return 0, fmt.Errorf("invalid relay port")
	}
	if _, err := codephrase.Parse(r.Code); err != nil {
		return 0, fmt.Errorf("invalid code")
	}
	if len(r.Paths) < 1 || len(r.Paths) > 16 {
		return 0, fmt.Errorf("select 1-16 files")
	}
	var total int64
	for _, path := range r.Paths {
		info, err := os.Lstat(path)
		if err != nil || !info.Mode().IsRegular() || info.Size() > 512*1024*1024 {
			return 0, fmt.Errorf("plain file required")
		}
		total += info.Size()
	}
	return total, nil
}

func run(input io.Reader, output io.Writer) error {
	decoder := json.NewDecoder(io.LimitReader(input, 64*1024))
	decoder.DisallowUnknownFields()
	var r request
	if err := decoder.Decode(&r); err != nil {
		return fmt.Errorf("invalid request")
	}
	total, err := validate(r)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(output)
	emit := func(phase string) error { return encoder.Encode(event{1, phase, len(r.Paths), total}) }
	if err := emit("queued"); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	go func() {
		var command struct {
			Cancel bool `json:"cancel"`
		}
		if decoder.Decode(&command) == nil && command.Cancel {
			cancel()
		}
	}()
	files, folders, count, err := croc.GetFilesInfoContext(ctx, r.Paths, false, false, nil)
	if err != nil {
		_ = emit("failed")
		return fmt.Errorf("source unavailable")
	}
	client, err := croc.NewCtx(ctx, croc.Options{IsSender: true, SharedSecret: r.Code, RelayAddress: r.Relay,
		RelayPassword: r.Password, DisableLocal: true, DisableClipboard: true, IgnoreStdin: true,
		NoPrompt: true, Quiet: true, Transport: croc.TransportRelay})
	if err != nil {
		_ = emit("failed")
		return fmt.Errorf("sender unavailable")
	}
	if err := emit("waiting"); err != nil {
		return err
	}
	err = client.Send(files, folders, count)
	if ctx.Err() != nil {
		_ = emit("cancelled")
		return fmt.Errorf("share stopped")
	}
	if err != nil || !client.NingmaoTransferSucceeded() {
		_ = emit("failed")
		return fmt.Errorf("receiver confirmation missing")
	}
	return emit("verified")
}

func main() {
	// Protocol secrets and paths must never enter the JSON task stream or raw logs.
	log.SetOutput(io.Discard)
	if sink, err := os.OpenFile(os.DevNull, os.O_WRONLY, 0); err == nil {
		os.Stderr = sink
		defer sink.Close()
	}
	if err := run(os.Stdin, os.Stdout); err != nil {
		os.Exit(1)
	}
}

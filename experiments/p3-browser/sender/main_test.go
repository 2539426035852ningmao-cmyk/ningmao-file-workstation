package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidateActualSource(t *testing.T) {
	path := filepath.Join(t.TempDir(), "中文.txt")
	if err := os.WriteFile(path, []byte("synthetic"), 0600); err != nil {
		t.Fatal(err)
	}
	r := request{Relay: "127.0.0.1:53317", Code: "acid-acorn-acre", Paths: []string{path}}
	if total, err := validate(r); err != nil || total != 9 {
		t.Fatalf("total=%d err=%v", total, err)
	}
	r.Relay = "192.168.1.1:53317"
	if _, err := validate(r); err == nil {
		t.Fatal("external relay accepted")
	}
	r.Relay = "127.0.0.1:53317"
	r.Paths = []string{filepath.Dir(path)}
	if _, err := validate(r); err == nil {
		t.Fatal("directory accepted")
	}
}

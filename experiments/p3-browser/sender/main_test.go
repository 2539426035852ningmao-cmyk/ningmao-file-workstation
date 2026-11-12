package main

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/schollz/croc/v11/src/croc"
)

func TestFailureExitCodeDoesNotExposeErrorText(t *testing.T) {
	for _, tc := range []struct {
		err  error
		code int
	}{
		{fmt.Errorf("private diagnostic: %w", context.DeadlineExceeded), 3},
		{fmt.Errorf("private diagnostic: %w", croc.ErrRelayConnection), 4},
		{fmt.Errorf("private diagnostic: %w", io.EOF), 5},
		{fmt.Errorf("private diagnostic: %w", io.ErrUnexpectedEOF), 5},
		{fmt.Errorf("private diagnostic"), 1},
	} {
		if got := failureExitCode(tc.err); got != tc.code {
			t.Fatalf("exit=%d want=%d", got, tc.code)
		}
	}
}

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

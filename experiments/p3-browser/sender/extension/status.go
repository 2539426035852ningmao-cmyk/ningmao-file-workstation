package croc

// Read the protocol completion flag through the upstream lifecycle lock.
func (c *Client) NingmaoTransferSucceeded() bool {
	return c.lifecycleSnapshot().Successful
}

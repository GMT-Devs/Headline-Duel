const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 24 * 60 * 60;

describe("HeadlineDuel", () => {
  let duel, curator, creator, alice, bob, carol;

  beforeEach(async () => {
    [curator, creator, alice, bob, carol] = await ethers.getSigners();
    duel = await (await ethers.getContractFactory("HeadlineDuel")).deploy();
  });

  async function start(overrides = {}) {
    const p = {
      question: "Which would make you click?",
      category: 0,
      a: "Coffee that wakes you up",
      b: "Fresh beans, every Monday",
      isImage: false,
      aiPick: 2,
      aiConfidence: 2,
      aiReason: "B names a concrete benefit and a rhythm.",
      duration: DAY,
      from: creator,
      ...overrides,
    };
    return duel
      .connect(p.from)
      .startDuel(p.question, p.category, p.a, p.b, p.isImage, p.aiPick, p.aiConfidence, p.aiReason, p.duration);
  }

  it("starts a duel and locks the AI pick + reason hash", async () => {
    const reason = "B names a concrete benefit and a rhythm.";
    await expect(start())
      .to.emit(duel, "DuelStarted")
      .withArgs(0, creator.address, 2, reason);
    const d = await duel.getDuel(0);
    expect(d.creator).to.equal(creator.address);
    expect(d.aiPick).to.equal(2);
    expect(d.aiConfidence).to.equal(2);
    expect(d.aiReasonHash).to.equal(ethers.keccak256(ethers.toUtf8Bytes(reason)));
    expect(await duel.duelCount()).to.equal(1);
    expect(await duel.isLive(0)).to.equal(true);
    const [created] = await duel.duelsOf(creator.address);
    expect(created.map(Number)).to.deep.equal([0]);
  });

  it("allows a duel without an AI pick", async () => {
    await start({ aiPick: 0, aiConfidence: 0, aiReason: "" });
    expect((await duel.getDuel(0)).aiReasonHash).to.equal(ethers.ZeroHash);
  });

  it("validates inputs", async () => {
    await expect(start({ question: "" })).to.be.revertedWithCustomError(duel, "InvalidInput");
    await expect(start({ category: 6 })).to.be.revertedWithCustomError(duel, "InvalidInput");
    await expect(start({ a: "" })).to.be.revertedWithCustomError(duel, "InvalidInput");
    await expect(start({ b: "Coffee that wakes you up" })).to.be.revertedWithCustomError(duel, "InvalidInput");
    await expect(start({ aiPick: 3 })).to.be.revertedWithCustomError(duel, "InvalidInput");
    await expect(start({ aiPick: 0 })).to.be.revertedWithCustomError(duel, "InvalidInput");
    await expect(start({ duration: 2 * DAY })).to.be.revertedWithCustomError(duel, "InvalidInput");
    await expect(start({ a: "x".repeat(561) })).to.be.revertedWithCustomError(duel, "InvalidInput");
    await start({ duration: 3 * DAY });
    await start({ duration: 7 * DAY });
  });

  it("records votes with reasons, one per wallet, not the creator", async () => {
    await start();
    await expect(duel.connect(alice).vote(0, 2, "B feels clearer"))
      .to.emit(duel, "Voted")
      .withArgs(0, alice.address, 2, "B feels clearer");
    await duel.connect(bob).vote(0, 1, "");
    await expect(duel.connect(alice).vote(0, 1, "changed my mind")).to.be.revertedWithCustomError(duel, "AlreadyVoted");
    await expect(duel.connect(creator).vote(0, 1, "")).to.be.revertedWithCustomError(duel, "CreatorCannotVote");
    await expect(duel.connect(carol).vote(0, 3, "")).to.be.revertedWithCustomError(duel, "InvalidInput");
    await expect(duel.connect(carol).vote(0, 1, "x".repeat(561))).to.be.revertedWithCustomError(duel, "InvalidInput");
    await expect(duel.connect(carol).vote(5, 1, "")).to.be.revertedWithCustomError(duel, "NotFound");

    const d = await duel.getDuel(0);
    expect(d.votesA).to.equal(1);
    expect(d.votesB).to.equal(1);
    expect(await duel.hasVoted(0, alice.address)).to.equal(true);
    expect(await duel.hasVoted(0, carol.address)).to.equal(false);
    expect(await duel.voteOf(0, alice.address)).to.equal(2);
    expect(await duel.totalVotes()).to.equal(2);
    const [, voted] = await duel.duelsOf(alice.address);
    expect(voted.map(Number)).to.deep.equal([0]);
  });

  it("rejects votes after the duel ends and computes the winner", async () => {
    await start();
    await duel.connect(alice).vote(0, 2, "");
    await duel.connect(bob).vote(0, 2, "");
    await duel.connect(carol).vote(0, 1, "");
    expect(await duel.winner(0)).to.equal(0); // live
    await time.increase(DAY);
    expect(await duel.isLive(0)).to.equal(false);
    expect(await duel.winner(0)).to.equal(2);
    await expect(duel.connect(curator).vote(0, 1, "")).to.be.revertedWithCustomError(duel, "NotLive");
  });

  it("returns draw on a tie", async () => {
    await start();
    await duel.connect(alice).vote(0, 2, "");
    await duel.connect(bob).vote(0, 1, "");
    await time.increase(DAY);
    expect(await duel.winner(0)).to.equal(3);
  });

  it("lets only the creator end early", async () => {
    await start();
    await duel.connect(alice).vote(0, 1, "");
    await expect(duel.connect(alice).endEarly(0)).to.be.revertedWithCustomError(duel, "NotCreator");
    await expect(duel.connect(creator).endEarly(0)).to.emit(duel, "DuelEnded").withArgs(0);
    expect(await duel.winner(0)).to.equal(1);
    await expect(duel.connect(creator).endEarly(0)).to.be.revertedWithCustomError(duel, "NotLive");
    await expect(duel.connect(bob).vote(0, 2, "")).to.be.revertedWithCustomError(duel, "NotLive");
  });

  it("lets only the curator hide, and blocks voting on hidden duels", async () => {
    await start();
    await expect(duel.connect(alice).setHidden(0, true)).to.be.revertedWithCustomError(duel, "NotCurator");
    await expect(duel.connect(curator).setHidden(0, true)).to.emit(duel, "DuelHidden").withArgs(0, true);
    expect((await duel.getDuel(0)).hidden).to.equal(true);
    await expect(duel.connect(alice).vote(0, 1, "")).to.be.revertedWithCustomError(duel, "NotLive");
    await duel.connect(curator).setHidden(0, false);
    await duel.connect(alice).vote(0, 1, "");
  });

  it("emits reports and rotates the curator", async () => {
    await start();
    await expect(duel.connect(alice).report(0, "spam")).to.emit(duel, "Reported").withArgs(0, alice.address, "spam");
    await expect(duel.connect(alice).setCurator(alice.address)).to.be.revertedWithCustomError(duel, "NotCurator");
    await duel.connect(curator).setCurator(alice.address);
    expect(await duel.curator()).to.equal(alice.address);
  });

  it("pages duels", async () => {
    for (let i = 0; i < 3; i++) await start({ a: `A${i}`, b: `B${i}` });
    expect((await duel.getDuels(0, 10)).length).to.equal(3);
    const page = await duel.getDuels(1, 1);
    expect(page.length).to.equal(1);
    expect(page[0].a).to.equal("A1");
    expect((await duel.getDuels(5, 2)).length).to.equal(0);
  });

  it("tracks AI accuracy across finished duels", async () => {
    await start({ a: "A0", b: "B0", aiPick: 2 }); // crowd B → AI right
    await start({ a: "A1", b: "B1", aiPick: 1 }); // crowd B → AI wrong
    await start({ a: "A2", b: "B2", aiPick: 0, aiConfidence: 0, aiReason: "" }); // no AI
    await start({ a: "A3", b: "B3", aiPick: 1 }); // draw → excluded
    for (const id of [0, 1, 2]) await duel.connect(alice).vote(id, 2, "");
    let s = await duel.stats();
    expect(s.aiFinished).to.equal(0);
    await time.increase(DAY);
    s = await duel.stats();
    expect(s.duelTotal).to.equal(4);
    expect(s.voteTotal).to.equal(3);
    expect(s.aiFinished).to.equal(2);
    expect(s.aiCorrect).to.equal(1);
  });
});

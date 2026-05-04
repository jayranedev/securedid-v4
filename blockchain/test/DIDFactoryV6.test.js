const { expect }  = require("chai");
const { ethers }  = require("hardhat");

describe("DIDFactory + DIDRegistryV6", function () {
  let factory;
  let deployer, p1, p2, p3, p4, p5, p6, student, platform, outsider;

  const INSTITUTION = {
    name:    "Don Bosco College of Engineering",
    website: "https://dbce.edu.in",
  };

  beforeEach(async function () {
    [deployer, p1, p2, p3, p4, p5, p6, student, platform, outsider] = await ethers.getSigners();
    const F = await ethers.getContractFactory("DIDFactory");
    factory = await F.deploy();
    await factory.waitForDeployment();
  });

  async function deployRegistry(overrides = {}) {
    const panelists = overrides.panelists ?? [p1.address, p2.address, p3.address, p4.address, p5.address];
    const name      = overrides.name ?? INSTITUTION.name;
    const website   = overrides.website ?? INSTITUTION.website;
    const tx = await factory.createRegistry(panelists, name, website);
    const rc = await tx.wait();
    const ev = rc.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } })
                       .find((x) => x?.name === "RegistryCreated");
    const addr = ev.args[0];
    return ethers.getContractAt("DIDRegistryV6", addr);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Factory
  // ────────────────────────────────────────────────────────────────────────────
  describe("Factory", function () {
    it("deploys a registry with correct panelists", async function () {
      const reg = await deployRegistry();
      const roster = await reg.getPanelists();
      expect(roster).to.deep.equal([p1.address, p2.address, p3.address, p4.address, p5.address]);
    });

    it("emits RegistryCreated with institution info", async function () {
      const tx = await factory.createRegistry(
        [p1.address, p2.address, p3.address, p4.address, p5.address],
        INSTITUTION.name, INSTITUTION.website,
      );
      await expect(tx).to.emit(factory, "RegistryCreated");
      const rc = await tx.wait();
      const ev = rc.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } })
                        .find((x) => x?.name === "RegistryCreated");
      expect(ev.args.deployer).to.equal(deployer.address);
      expect(ev.args.name).to.equal(INSTITUTION.name);
      expect(ev.args.website).to.equal(INSTITUTION.website);
    });

    it("stores institution info and increments registryCount", async function () {
      const before = await factory.registryCount();
      const reg = await deployRegistry();
      const after  = await factory.registryCount();
      expect(after - before).to.equal(1n);

      const info = await factory.getInstitution(await reg.getAddress());
      expect(info.name).to.equal(INSTITUTION.name);
      expect(info.website).to.equal(INSTITUTION.website);
      expect(info.deployer).to.equal(deployer.address);
      expect(info.deployedAt).to.be.gt(0);
    });

    it("rejects zero-address panelist", async function () {
      await expect(factory.createRegistry(
        [ethers.ZeroAddress, p2.address, p3.address, p4.address, p5.address],
        "Test A", "",
      )).to.be.revertedWithCustomError(factory, "ZeroPanelist");
    });

    it("rejects duplicate panelist", async function () {
      await expect(factory.createRegistry(
        [p1.address, p1.address, p3.address, p4.address, p5.address],
        "Test B", "",
      )).to.be.revertedWithCustomError(factory, "DuplicatePanelist");
    });

    it("rejects empty name", async function () {
      await expect(factory.createRegistry(
        [p1.address, p2.address, p3.address, p4.address, p5.address],
        "", "",
      )).to.be.revertedWithCustomError(factory, "EmptyName");
    });

    it("rejects duplicate institution name", async function () {
      await deployRegistry({ name: "Unique College" });
      await expect(factory.createRegistry(
        [p2.address, p3.address, p4.address, p5.address, p6.address],
        "Unique College", "",
      )).to.be.revertedWithCustomError(factory, "NameTaken");
    });

    it("paginated listing returns correct ranges", async function () {
      for (let i = 0; i < 3; i++) {
        await deployRegistry({ name: `College ${i}` });
      }
      const page0 = await factory.getRegistriesPaginated(0, 2);
      expect(page0.length).to.equal(2);
      const page1 = await factory.getRegistriesPaginated(2, 2);
      expect(page1.length).to.equal(1);
      const past  = await factory.getRegistriesPaginated(10, 2);
      expect(past.length).to.equal(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Registry: constructor
  // ────────────────────────────────────────────────────────────────────────────
  describe("Registry constructor (via factory)", function () {
    it("stores _isPanelist mapping correctly", async function () {
      const reg = await deployRegistry();
      expect(await reg.isPanelist(p1.address)).to.equal(true);
      expect(await reg.isPanelist(p3.address)).to.equal(true);
      expect(await reg.isPanelist(outsider.address)).to.equal(false);
    });

    it("exposes constants", async function () {
      const reg = await deployRegistry();
      expect(await reg.THRESHOLD()).to.equal(3);
      expect(await reg.PANELIST_COUNT()).to.equal(5);
      expect(await reg.PROPOSAL_EXPIRY()).to.equal(7 * 24 * 3600);
    });

    it("ENROLLMENT_SALT matches keccak256('SecureDID-V6-Enrollment')", async function () {
      const reg = await deployRegistry();
      const expected = ethers.keccak256(ethers.toUtf8Bytes("SecureDID-V6-Enrollment"));
      expect(await reg.ENROLLMENT_SALT()).to.equal(expected);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Enrollment proposal flow
  // ────────────────────────────────────────────────────────────────────────────
  describe("Enrollment proposals", function () {
    it("non-panelist cannot propose", async function () {
      const reg = await deployRegistry();
      const c = ethers.randomBytes(32);
      await expect(reg.connect(outsider).proposeEnrollment(c))
        .to.be.revertedWithCustomError(reg, "NotPanelist");
    });

    it("proposer auto-approves; 2 more approvals executes", async function () {
      const reg = await deployRegistry();
      const c = ethers.keccak256(ethers.toUtf8Bytes("commit-1"));

      const tx1 = await reg.connect(p1).proposeEnrollment(c);
      const rc1 = await tx1.wait();
      const created = rc1.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
                              .find((e) => e?.name === "ProposalCreated");
      const id = created.args.id;

      let [,approvals,executed] = await reg.getProposal(id);
      expect(approvals).to.equal(1);
      expect(executed).to.equal(false);

      await reg.connect(p2).approveProposal(id);
      [,approvals,executed] = await reg.getProposal(id);
      expect(approvals).to.equal(2);
      expect(executed).to.equal(false);

      await reg.connect(p3).approveProposal(id);
      [,approvals,executed] = await reg.getProposal(id);
      expect(approvals).to.equal(3);
      expect(executed).to.equal(true);
      expect(await reg.isEnrollmentAuthorized(c)).to.equal(true);
    });

    it("same panelist cannot vote twice", async function () {
      const reg = await deployRegistry();
      const c = ethers.keccak256(ethers.toUtf8Bytes("commit-2"));
      const tx = await reg.connect(p1).proposeEnrollment(c);
      const rc = await tx.wait();
      const id = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
                        .find((e) => e?.name === "ProposalCreated").args.id;

      await expect(reg.connect(p1).approveProposal(id))
        .to.be.revertedWithCustomError(reg, "AlreadyVoted");
    });

    it("expires after 7 days", async function () {
      const reg = await deployRegistry();
      const c = ethers.keccak256(ethers.toUtf8Bytes("commit-3"));
      const tx = await reg.connect(p1).proposeEnrollment(c);
      const rc = await tx.wait();
      const id = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
                        .find((e) => e?.name === "ProposalCreated").args.id;

      await ethers.provider.send("evm_increaseTime", [8 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);

      await expect(reg.connect(p2).approveProposal(id))
        .to.be.revertedWithCustomError(reg, "ProposalExpired");
    });

    it("rejects zero commitment", async function () {
      const reg = await deployRegistry();
      await expect(reg.connect(p1).proposeEnrollment(ethers.ZeroHash))
        .to.be.revertedWith("Zero commitment");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Student registration → DID issuance
  // ────────────────────────────────────────────────────────────────────────────
  describe("Student registration & DID issuance", function () {
    async function authorizeCommitment(reg, commitment) {
      const tx = await reg.connect(p1).proposeEnrollment(commitment);
      const rc = await tx.wait();
      const id = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
                        .find((e) => e?.name === "ProposalCreated").args.id;
      await reg.connect(p2).approveProposal(id);
      await reg.connect(p3).approveProposal(id);
      return id;
    }

    it("rejects registration without authorised commitment", async function () {
      const reg = await deployRegistry();
      const encPubkey = ethers.randomBytes(32);
      const fakeCommit = ethers.keccak256(ethers.toUtf8Bytes("not-authorised"));

      await expect(reg.connect(student).registerStudent("0xabcd", fakeCommit, encPubkey))
        .to.be.revertedWithCustomError(reg, "NotAuthorized");
    });

    it("full 3-of-5 flow issues a DID", async function () {
      const reg = await deployRegistry();
      const commit = ethers.keccak256(ethers.toUtf8Bytes("alice-commit"));
      await authorizeCommitment(reg, commit);

      const encPubkey = ethers.randomBytes(32);
      await reg.connect(student).registerStudent("metadata-hash", commit, encPubkey);
      expect(await reg.pendingRegistration(student.address)).to.equal(true);

      await reg.connect(p1).approveStudent(student.address, "QmCID1");
      await reg.connect(p2).approveStudent(student.address, "QmCID1");
      expect(await reg.getCID(student.address)).to.equal("");

      await reg.connect(p3).approveStudent(student.address, "QmCID1");
      expect(await reg.getCID(student.address)).to.equal("QmCID1");
      expect(await reg.pendingRegistration(student.address)).to.equal(false);
      expect(await reg.revocationIndex(student.address)).to.be.gt(0);

      // Encryption pubkey stored
      const stored = await reg.getEncryptionPubkey(student.address);
      expect(stored).to.equal(ethers.hexlify(encPubkey));
    });

    it("commitment is single-use after registration", async function () {
      const reg = await deployRegistry();
      const commit = ethers.keccak256(ethers.toUtf8Bytes("bob-commit"));
      await authorizeCommitment(reg, commit);

      const encPubkey = ethers.randomBytes(32);
      await reg.connect(student).registerStudent("meta", commit, encPubkey);

      // commitment now flipped to false
      expect(await reg.isEnrollmentAuthorized(commit)).to.equal(false);
      // another student cannot reuse it
      await expect(reg.connect(outsider).registerStudent("meta", commit, ethers.randomBytes(32)))
        .to.be.revertedWithCustomError(reg, "NotAuthorized");
    });

    it("rejects non-32-byte encryption pubkey", async function () {
      const reg = await deployRegistry();
      const commit = ethers.keccak256(ethers.toUtf8Bytes("eve-commit"));
      await authorizeCommitment(reg, commit);

      await expect(reg.connect(student).registerStudent("meta", commit, ethers.randomBytes(16)))
        .to.be.revertedWith("Bad encryption pubkey");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Revocation proposal flow
  // ────────────────────────────────────────────────────────────────────────────
  describe("Revocation proposals", function () {
    async function issueStudent(reg, who = student, label = "x") {
      const commit = ethers.keccak256(ethers.toUtf8Bytes(`${label}-commit`));
      const tx = await reg.connect(p1).proposeEnrollment(commit);
      const rc = await tx.wait();
      const id = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
                        .find((e) => e?.name === "ProposalCreated").args.id;
      await reg.connect(p2).approveProposal(id);
      await reg.connect(p3).approveProposal(id);
      await reg.connect(who).registerStudent("meta", commit, ethers.randomBytes(32));
      await reg.connect(p1).approveStudent(who.address, `Qm${label}`);
      await reg.connect(p2).approveStudent(who.address, `Qm${label}`);
      await reg.connect(p3).approveStudent(who.address, `Qm${label}`);
    }

    it("requires 3-of-5 to revoke", async function () {
      const reg = await deployRegistry();
      await issueStudent(reg, student, "alice");

      const tx = await reg.connect(p1).proposeRevocation(student.address, "academic fraud");
      const rc = await tx.wait();
      const id = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
                        .find((e) => e?.name === "ProposalCreated").args.id;
      expect(await reg.isStudentRevoked(student.address)).to.equal(false);

      await reg.connect(p2).approveProposal(id);
      expect(await reg.isStudentRevoked(student.address)).to.equal(false);

      await reg.connect(p3).approveProposal(id);
      expect(await reg.isStudentRevoked(student.address)).to.equal(true);
      expect(await reg.revokedAt(student.address)).to.be.gt(0);
    });

    it("cannot propose revocation for address without active CID", async function () {
      const reg = await deployRegistry();
      await expect(reg.connect(p1).proposeRevocation(student.address, "whatever"))
        .to.be.revertedWithCustomError(reg, "NoActiveCID");
    });

    it("cannot double-revoke", async function () {
      const reg = await deployRegistry();
      await issueStudent(reg, student, "bob");

      const tx1 = await reg.connect(p1).proposeRevocation(student.address, "r1");
      const rc1 = await tx1.wait();
      const id1 = rc1.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
                          .find((e) => e?.name === "ProposalCreated").args.id;
      await reg.connect(p2).approveProposal(id1);
      await reg.connect(p3).approveProposal(id1);

      // second revocation proposal should execute and hit AlreadyRevoked
      const tx2 = await reg.connect(p1).proposeRevocation(student.address, "r2");
      const rc2 = await tx2.wait();
      const id2 = rc2.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
                          .find((e) => e?.name === "ProposalCreated").args.id;
      await reg.connect(p2).approveProposal(id2);
      await expect(reg.connect(p3).approveProposal(id2))
        .to.be.revertedWithCustomError(reg, "AlreadyRevoked");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Panelist replacement
  // ────────────────────────────────────────────────────────────────────────────
  describe("Panelist replacement", function () {
    it("replaces slot via 3-of-5 proposal", async function () {
      const reg = await deployRegistry();

      const tx = await reg.connect(p1).proposeReplacePanelist(2, p6.address);
      const rc = await tx.wait();
      const id = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
                        .find((e) => e?.name === "ProposalCreated").args.id;
      await reg.connect(p2).approveProposal(id);
      await reg.connect(p3).approveProposal(id);

      const roster = await reg.getPanelists();
      expect(roster[2]).to.equal(p6.address);
      expect(await reg.isPanelist(p3.address)).to.equal(false);
      expect(await reg.isPanelist(p6.address)).to.equal(true);
    });

    it("rejects replacement that would duplicate existing panelist", async function () {
      const reg = await deployRegistry();
      // Propose slot 2 to become p1 (already in slot 0) — should revert at execute time
      const tx = await reg.connect(p1).proposeReplacePanelist(2, p1.address);
      const rc = await tx.wait();
      const id = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
                        .find((e) => e?.name === "ProposalCreated").args.id;
      await reg.connect(p2).approveProposal(id);
      await expect(reg.connect(p3).approveProposal(id))
        .to.be.revertedWithCustomError(reg, "DuplicatePanelist");
    });

    it("replacement rejects bad slot index", async function () {
      const reg = await deployRegistry();
      await expect(reg.connect(p1).proposeReplacePanelist(9, p6.address))
        .to.be.revertedWithCustomError(reg, "InvalidSlot");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Access grants
  // ────────────────────────────────────────────────────────────────────────────
  describe("Access grants", function () {
    it("grant + revoke + TTL expiry", async function () {
      const reg = await deployRegistry();
      await reg.connect(student).grantAccess(platform.address, 3600);
      expect(await reg.hasAccess(student.address, platform.address)).to.equal(true);

      await reg.connect(student).revokeAccess(platform.address);
      expect(await reg.hasAccess(student.address, platform.address)).to.equal(false);

      // TTL expiry
      await reg.connect(student).grantAccess(platform.address, 60);
      await ethers.provider.send("evm_increaseTime", [120]);
      await ethers.provider.send("evm_mine", []);
      expect(await reg.hasAccess(student.address, platform.address)).to.equal(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Isolation between registries
  // ────────────────────────────────────────────────────────────────────────────
  describe("Multi-institution isolation", function () {
    it("two registries have independent state", async function () {
      const regA = await deployRegistry({ name: "College A" });
      const regB = await deployRegistry({
        name: "College B",
        panelists: [p2.address, p3.address, p4.address, p5.address, p6.address],
      });

      // authorise in A only
      const c = ethers.keccak256(ethers.toUtf8Bytes("shared-commit"));
      const tx = await regA.connect(p1).proposeEnrollment(c);
      const rc = await tx.wait();
      const id = rc.logs.map((l) => { try { return regA.interface.parseLog(l); } catch { return null; } })
                        .find((e) => e?.name === "ProposalCreated").args.id;
      await regA.connect(p2).approveProposal(id);
      await regA.connect(p3).approveProposal(id);

      expect(await regA.isEnrollmentAuthorized(c)).to.equal(true);
      expect(await regB.isEnrollmentAuthorized(c)).to.equal(false);

      // p1 is panelist only in A, not B
      expect(await regA.isPanelist(p1.address)).to.equal(true);
      expect(await regB.isPanelist(p1.address)).to.equal(false);
    });
  });
});

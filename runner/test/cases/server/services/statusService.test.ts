import * as Code from "@hapi/code";
import * as Lab from "@hapi/lab";
import sinon from "sinon";

import { StatusService } from "server/services/statusService";
import { FormModel } from "../../../../src/server/plugins/engine/models";

const form = require("./../status.test.json");

const { expect } = Code;
const lab = Lab.script();
exports.lab = lab;
const { afterEach, suite, test, describe } = lab;

const cacheService = { getState: () => ({}), mergeState: () => {} },
  webhookService = { postRequest: () => ({}) },
  notifyService = { sendNotification: () => ({}) },
  payService = {
    payStatus: () => {},
  };

const yar = {
  id: "session_id",
};

const server = {
  services: () => ({
    cacheService,
    webhookService,
    payService,
    notifyService,
  }),
  logger: {
    info: () => {},
    trace: () => {},
  },
};
suite("Server StatusService", () => {
  describe("shouldRetryPay", () => {
    afterEach(() => {
      sinon.restore();
    });
    test("returns false when no pay information is saved in the session", async () => {
      const statusService = new StatusService(server);
      expect(await statusService.shouldRetryPay({ yar })).to.equal(false);
    });

    test("returns false when the continue query parameter is true", async () => {
      sinon.stub(cacheService, "getState").returns({ state: { pay: {} } });
      const statusService = new StatusService(server);
      expect(
        await statusService.shouldRetryPay({ yar, query: { continue: "true" } })
      ).to.equal(false);
    });

    test("returns false when 3 pay attempts have been made", async () => {
      sinon
        .stub(cacheService, "getState")
        .returns({ state: { pay: { meta: 3 } } });
      const statusService = new StatusService(server);

      expect(await statusService.shouldRetryPay({ yar })).to.equal(false);
    });

    test("returns true when <3 pay attempts have been made", async () => {
      sinon
        .stub(cacheService, "getState")
        .returns({ pay: { meta: { attempts: 1 } } });

      sinon.stub(payService, "payStatus").returns({
        state: {
          status: "failed",
        },
      });

      const statusService = new StatusService(server);
      expect(await statusService.shouldRetryPay({ yar })).to.equal(true);
    });

    test("returns true when <3 and the continue query is true", async () => {
      sinon
        .stub(cacheService, "getState")
        .returns({ pay: { meta: { attempts: 1 } } });

      sinon.stub(payService, "payStatus").returns({
        state: {
          status: "failed",
        },
      });

      const statusService = new StatusService(server);
      expect(
        await statusService.shouldRetryPay({ yar, query: { continue: "true" } })
      ).to.equal(false);
    });
  });

  describe("outputRequests", () => {
    afterEach(() => {
      sinon.restore();
    });
    const notifyOutput = {
      outputData: {
        type: "notify",

        apiKey: "a",
        templateId: "b",
        emailAddress: "c",
        personalisation: {},
        addReferencesToPersonalisation: false,
      },
    };
    const firstWebhook = {
      type: "webhook",
      outputData: { url: "abc" },
    };
    const webhookOutput = {
      type: "webhook",
      outputData: { url: "" },
    };
    const outputs = [firstWebhook, webhookOutput, webhookOutput, notifyOutput];
    const state = {
      webhookData: { metadata: {} },
      outputs,
      pay: { meta: { attempts: 1 } },
    };

    test("makes and returns correct output requests", async () => {
      sinon.stub(cacheService, "getState").returns(state);
      const stub = sinon.stub(webhookService, "postRequest");
      stub
        .onCall(0)
        .resolves("abcd-ef-g")
        .onCall(1)
        .rejects()
        .onCall(2)
        .resolves("3");

      const statusService = new StatusService(server);
      const res = await statusService.outputRequests({ yar });

      const results = await res.results;
      expect(res.reference).to.equal("abcd-ef-g");
      expect(results.length).to.equal(outputs.length - 1);
      expect(results.map((result) => result.status)).to.equal([
        "fulfilled",
        "rejected",
        "fulfilled",
      ]);
      expect(results[2].value).to.equal("3");
    });
  });

  describe("getViewModel", () => {
    test("returns the correct components based on a condition", () => {
      const stateForLisbon = {
        whichConsulate: "lisbon",
      };

      const formModel = new FormModel(form, {});
      const statusService = new StatusService(server);

      const lisbonViewModel = statusService.getViewModel(
        stateForLisbon,
        formModel
      );

      expect(lisbonViewModel.components.length).to.equal(1);
      expect(lisbonViewModel.components[0].model).to.equal({
        attributes: {},
        content: "lisbon",
        condition: "isLisbon",
      });
      const stateForPortimao = {
        whichConsulate: "portimao",
      };

      const portimaoViewModel = statusService.getViewModel(
        stateForPortimao,
        formModel
      );
      expect(portimaoViewModel.components[0].model).to.equal({
        attributes: {},
        content: "portimao",
        condition: "isPortimao",
      });
    });
  });
});

"use client";

import { useCallback, useEffect, useState } from "react";
import { read } from "./read-client";
import { Badge, ErrorState, Facts, Loading, Panel, Time } from "./primitives";
import {
  capabilityObservedAt,
  capabilityStatus,
  creditDisplay,
  costFor,
  creditFor,
  financialDisplay,
  formatMetric,
  formatMoney,
  resourcesFor,
  serviceBreakdown,
  type CloudCost,
  type CloudObserverData,
} from "./cloud-observer-model";

function freshnessFor(data: CloudObserverData, provider: "AWS" | "GCP", capability: "infrastructure" | "cost") {
  const snapshot = capability === "infrastructure" ? resourcesFor(data, provider)[0] : costFor(data, provider);
  return capabilityStatus(data, provider, capability, snapshot?.freshness);
}

function costFact(cost: CloudCost | undefined, key: keyof Pick<CloudCost, "monthToDateGrossCost" | "creditsApplied" | "monthToDateNetCost" | "dailyBurnRate" | "projectedMonthEnd">) {
  const display = financialDisplay(cost, key);
  return display.status === "ESTIMATED" || display.status === "DELAYED" ? <>{display.text} <Badge value={display.status} /></> : display.text;
}

function ProviderPanel({ data, provider }: { data: CloudObserverData; provider: "AWS" | "GCP" }) {
  const resources = resourcesFor(data, provider);
  const cost = costFor(data, provider);
  const latestResource = resources[0];
  const projectOrAccount = latestResource?.accountId ?? cost?.accountId ?? "Unknown";
  const infraFreshness = freshnessFor(data, provider, "infrastructure");
  return (
    <Panel className="cloud-observer-card" label={`${provider === "AWS" ? "01" : "02"} / Provider overview`} title={provider === "AWS" ? "Amazon Web Services" : "Google Cloud"}>
      <div className="cloud-observer-status"><Badge value={String(infraFreshness)} /></div>
      <Facts rows={[
        [provider === "AWS" ? "Account" : "Project", projectOrAccount],
        ["Resources", provider === "GCP" && resources.length === 0 ? "No active Compute Engine resources" : String(resources.length)],
        ["Infrastructure freshness", <Badge key="freshness" value={String(infraFreshness)} />],
        ["Last observed", <Time key="observed" value={capabilityObservedAt(data, provider, "infrastructure", latestResource?.observedAt)} />],
      ]} />
    </Panel>
  );
}

function ResourcePanel({ data, provider }: { data: CloudObserverData; provider: "AWS" | "GCP" }) {
  const resources = resourcesFor(data, provider);
  return (
    <Panel className="cloud-observer-card" label={`${provider === "AWS" ? "03" : "04"} / Resources`} title={provider === "AWS" ? "AWS Lightsail" : "GCP Compute Engine"}>
      {resources.length === 0 ? <p className="muted">{provider === "GCP" ? "No active Compute Engine resources" : "No resource snapshots available"}</p> : (
        <div className="cloud-resource-list">
          {resources.slice(0, 10).map((resource) => (
            <div className="cloud-resource-row" key={`${resource.provider}-${resource.resourceId}`}>
              <strong>{String(resource.metadata.name ?? resource.resourceId)}</strong>
              <span>{resource.region ?? "Region unknown"} · {resource.status}</span>
              <span>CPU {formatMetric(resource.cpuUtilization, "%")} · {resource.freshness}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function FinopsPanel({ data, provider }: { data: CloudObserverData; provider: "AWS" | "GCP" }) {
  const cost = costFor(data, provider);
  const credit = creditFor(data, provider);
  const costStatus = capabilityStatus(data, provider, "cost", cost?.freshness);
  const services = serviceBreakdown(cost);
  return (
    <Panel className="cloud-observer-card" label={`${provider === "AWS" ? "05" : "06"} / FinOps`} title={`${provider} Cost & Usage`}>
      <div className="cloud-observer-status"><Badge value={String(costStatus)} /></div>
      <Facts rows={[
        ["MTD gross cost", costFact(cost, "monthToDateGrossCost")],
        ["Credits used", costFact(cost, "creditsApplied")],
        ["MTD net cost", costFact(cost, "monthToDateNetCost")],
        ["Recent daily burn", costFact(cost, "dailyBurnRate")],
        ["Projected month-end", costFact(cost, "projectedMonthEnd")],
        ["Remaining credit", (() => { const display = creditDisplay(credit); return display.status === "ESTIMATED" || display.status === "DELAYED" ? <>{display.text} <Badge value={display.status} /></> : display.text; })()],
      ]} />
      {services.length > 0 && <div className="cloud-service-breakdown"><p className="eyebrow">Service breakdown</p>{services.map(([service, value]) => <div className="cloud-service-row" key={service}><span>{service}</span><strong>{formatMoney(value, cost?.currency)}</strong></div>)}</div>}
      {cost?.providerDataAsOf && <p className="muted cloud-observer-asof">Provider data as of <Time value={cost.providerDataAsOf} /></p>}
    </Panel>
  );
}

function ObserverPanels({ data }: { data: CloudObserverData }) {
  return (
    <div className="cloud-observer-grid">
      <ProviderPanel data={data} provider="AWS" />
      <ProviderPanel data={data} provider="GCP" />
      <ResourcePanel data={data} provider="AWS" />
      <ResourcePanel data={data} provider="GCP" />
      <FinopsPanel data={data} provider="AWS" />
      <FinopsPanel data={data} provider="GCP" />
    </div>
  );
}

export function CloudObserverSurface({ mobile = false }: { mobile?: boolean }) {
  const [data, setData] = useState<CloudObserverData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    read<CloudObserverData>("/api/v1/cloud-observer", signal)
      .then((result) => { setData(result); setError(false); })
      .catch((reason) => { if (reason?.name !== "AbortError") setError(true); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (loading && !data) return <Panel label="Cloud Observer" title="Infrastructure & FinOps"><Loading /></Panel>;
  if (error && !data) return <ErrorState retry={() => load()}>Cloud Observer data is unavailable. AWS and GCP provider state could not be loaded.</ErrorState>;
  if (!data) return null;
  return (
    <section className={mobile ? "mobile-section cloud-observer-surface" : "cloud-observer-surface"}>
      <div className="cloud-observer-heading">
        <div><p className="eyebrow">Cloud Observer / Read-only snapshots</p><h2>Infrastructure &amp; FinOps</h2></div>
        {error && <Badge value="STALE" />}
      </div>
      <ObserverPanels data={data} />
    </section>
  );
}
